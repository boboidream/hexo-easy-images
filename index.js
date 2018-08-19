const os = require('os')
const fs = require('hexo-fs');
const del = require('del')
const path = require('path')
const request = require('request');
const Eventproxy = require('eventproxy');
const copyFileSync = require('fs-copy-file-sync');
const readChunk = require('read-chunk');
const imageType = require('image-type');
const sharp = require('sharp');
const sizeOf = require('image-size');
const log = require('hexo-log')({
  debug: false,
  silent: false
});

// 处理 post 中图片
hexo.extend.processor.register('posts/:id.md', function(file) {
  const config = this.config.easy_images
  const ep = new Eventproxy()

  if (file.type == 'delete') return file
  if (file.type == 'skip' && config && !config.init) return file

  log.info(`EasyImages: process ${file.params.id}`)
  //获取图片列表
  var content =  fs.readFileSync(file.source)
  var pattern = /!\[.*?\]\((.*?)\)/g
  var absolute_images = []
  var relative_images = []
  var online_images = []
  var diff_list = []

  while((match=pattern.exec(content)) != null) {
    let url = match[1]

    if (url[0] == '/' || url[0] == '~') {
      absolute_images.push(url)
    } else if (/^http/.test(url)) {
      online_images.push(url)
    } else if (url) {
      relative_images.push(url)
    }
  }

  if (absolute_images.length + relative_images.length + online_images.length  == 0) return file

  var dir_root = this.base_dir
  var dir_post = path.dirname(file.source)
  var dir_source = this.source_dir
  var dir_images = path.join(dir_source, 'images', file.params.id)

  if (!fs.existsSync(dir_images)) fs.mkdirsSync(dir_images)

  // 将绝对路径图片加入待处理队列 diff_list
  absolute_images.forEach(img => {
    let info = {
      origin: img
    }

    if (img[0] == '~') img = os.homedir() + img.substring(1)

    if (fs.existsSync(img)) {
      info.from = img
    } else if (fs.existsSync(path.join(dir_root, img))) {
      info.from = path.join(dir_root, img)
    } else {
      log.warn(`${file.id}: Can't find ${img}`)
      return
    }

    if (path.dirname(info.from) == dir_images) {
      info.skip_copy = true
    }

    info.to = path.join(dir_images, path.basename(info.from))
    info.new = path.relative(dir_post, info.to)
    diff_list.push(info)
  })

  // 将相对路径图片加入待处理队列 diff_list
  relative_images.forEach(img => {
    let info = {
      origin: img
    }

    info.from = path.resolve(dir_post, img)

    if (!fs.existsSync(info.from)) {
      log.warn(`${file.id}: Can't find ${img}`)
      return
    }

    if (path.dirname(info.from) == dir_images) {
      info.skip_copy = true
    }

    info.to = path.join(dir_images, path.basename(info.from))
    info.new = path.relative(dir_post, info.to)
    diff_list.push(info)
  })

  // 下载图片
  if (online_images.length) {
    var Bagpipe = require('bagpipe')
    var bagpipe = new Bagpipe(10)

    del.sync(dir_images + '/ol-*')

    for(var i = 0; i < online_images.length; i++) {
      bagpipe.push(downloadImg, online_images[i], function(e){
        log.error(e)
      })
    }
  }

  // 处理图片与 Post
  ep.after('download', online_images.length, (list) => {
    var mapObj = {}

    diff_list.forEach(info => {
      //Copy 本地图片
      if (!info.skip_copy) {
        copyFileSync(info.from, info.to)
      }

      //修正图片后缀
      info.to = fixExt(info.to)

      //压缩图片
      if (config && (config.max_width || config.max_height)){
        info.to = resizeImg(info.to, config.max_width, config.max_height)
        info.new = path.relative(dir_post, info.to)
      }

      //替换图片新地址
      if (info.new && info.origin != info.new) {
        info.origin = info.origin.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")
        mapObj[info.origin] = info.new
      }
    })


    if (Object.keys(mapObj).length) content = replaceAll(content, mapObj)

    fs.writeFile(file.source, content)
    return file
  })

  ep.fail((err) => {
    log.error(err)
  })


  //-------------------------------------------------------------
  function fixExt(path_img) {
    if (!fs.existsSync(path_img)) return path_img

    let buffer = readChunk.sync(path_img, 0, 12);
    let origin_ext = path.extname(path_img)
    let real = imageType(buffer)

    if (!real) {
      log.warn(`Can't recognize ${path_img}.`)
      return path_img
    }

    let real_ext = '.' + real.ext
    let path_res = path_img

    if (origin_ext.toLowerCase() != real_ext) {
      path_res = path_img.replace(origin_ext, real_ext)
      fs.renameSync(path_img, path_res)
      log.info(`Fix ${path_img} to ${real.ext} success!`)
      return path_res
    } else {
      return path_res
    }
  }

  function resizeImg(path_img, w, h) {
    if (!fs.existsSync(path_img)) return path_img
    if (path.extname(path_img).toLowerCase() == '.gif') return path_img

    var dimensions = null
    var path_res = path_img

    try {
      dimensions = sizeOf(path_img)
    } catch (err) {
      log.warn(`ImageSize: can't recognize ${path_img}.`)
      return path_img
    }

    if (dimensions.width > w || dimensions.height > h) {
      let path_res = path_img
      let img_ext = path.extname(path_img)

      path_res = path_img.replace(img_ext, '-s' + img_ext)
      sharp(path_img)
        .resize(w, h)
        .max()
        .withoutEnlargement()
        .toFile(path_res)
        .then(data => log.info(`Resize ${path_img} success.`))
        .catch(e => log.error(e))

      return path_res
    } else {
      return path_res
    }
  }

  function downloadImg(src) {
    let name = 'ol-' + Date.now() + '.jpg'
    let dest = path.join(dir_images, name)
    let ws = fs.ensureWriteStreamSync(dest)
    let new_path = ''

    request(src).on('error', (err) => {
      del.sync(dest)
      log.warn(`Download ${src} failed.`)
      return
    }).pipe(ws)

    ws.on('finish', () => {
      new_path = path.relative(dir_post, dest)

      diff_list.push({
        origin: src,
        new: new_path,
        from: false,
        to: dest,
        skip_copy: true
      })

      ep.emit('download', new_path)
    }).on('error', (err) => {
      log.error(`Write ${dest} failed.`)
      log.error(err)
      del.sync(dest)
    })
  }

  function replaceAll(str, mapObj){
    var re = new RegExp(Object.keys(mapObj).join("|"),"gi");

    return str.replace(re, function(matched){
      return mapObj[matched.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")]
    });
  }

})

//将相对地址转为绝对地址
hexo.extend.filter.register('before_post_render', function(data){
  const config = this.config.easy_images
  var dir_post = path.join(this.source_dir, data.source)
  var post_id = path.basename(data.source, '.md')
  var dir_images = path.join(this.source_dir, 'images', post_id)
  var pattern = /!\[(.*?)\]\((.*?)\)/g

  data.content = data.content.replace(pattern, (match, alt, src) => {
    if (path.dirname(src) != path.relative(path.dirname(dir_post), dir_images)) {
      return match
    }

    let path_img = path.resolve(dir_post, '..', src)
    let src_new = path_img.replace(this.source_dir, '/')

    if (config && config.cdn_prefix && src_new[0] == '/') {
       src_new = config.cdn_prefix + src_new
    }

    return `![${alt}](${src_new})`
  })

  return data;
});
