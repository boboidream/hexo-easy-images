var os = require('os')
var fs = require('hexo-fs');
var del = require('del') 
var path = require('path')
var request = require('request');
var Eventproxy = require('eventproxy');
const copyFileSync = require('fs-copy-file-sync');
const readChunk = require('read-chunk'); 
const imageType = require('image-type');
const sharp = require('sharp');
const sizeOf = require('image-size');
var log = require('hexo-log')({
  debug: false,
  silent: false
});


hexo.extend.processor.register('posts/:id.md', function(file) {
  const config = this.config.easy_images
  var ep = new Eventproxy()

  if (file.type == 'delete') return file
  if (file.type == 'skip' && config && !config.init) return file

  //获取图片地址
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
  
  absolute_images.forEach(img => {
    let info = {
      origin: img
    }

    if (img[0] == '~') img = os.homedir() + img.substring(1) 

    if (fs.existsSync(img)) info.from = img 
    
    if (fs.existsSync(path.join(dir_root, img))) info.from = path.join(dir_root, img)

    if (!info.from) {
      log.warn(`${file.id}: Can't find ${img}`)
      return
    }

    info.to = path.join(dir_images, path.basename(info.from))
    log.info(dir_post+','+info.to)
    info.new = path.relative(dir_post, info.to)
    diff_list.push(info)
  })
  
  relative_images.forEach(img => {
    let info = {
      origin: img
    }

    info.from = path.resolve(dir_post, img)

    if (!fs.existsSync(info.from)) {
      log.warn(`${file.id}: Can't find ${img}`)
      return
    } 

    if (path.dirname(info.from) == dir_images) return

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
      bagpipe.push(downloadImg, online_images[i], function(e, data){
        log.error(e)
      })
    }
  }

  // 处理图片与 Post
  ep.after('download', online_images.length, (list) => {
    var mapObj = {}

    diff_list.forEach(info => {
      //Copy 本地图片
      if (info.from && info.from != info.to) {
        copyFileSync(info.from, info.to)
        info.to = fixExt(info.to)
      }

      //压缩图片
      if (config.max_width || config.max_height){
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

  function fixExt(path_img) {
    let buffer = readChunk.sync(path_img, 0, 12);
    let origin_ext = path.extname(path_img) 
    let real = imageType(buffer);
    let real_ext = '.' + real.ext
    let path_res = path_img

    if (origin_ext.toLowerCase() != real_ext) {
      path_res = path_img.replace(origin_ext, real_ext)
      
      try {
        fs.renameSync(path_img, path_res) 
      } catch(err) {
        log.error(`Rename ${path_img} error.`)
      }      

      log.info(`Fix ${path_img} to ${real.ext} success!`)
    }

    return path_res
  }

  function resizeImg(path_img, w, h) {
    if (!path_img) log.warn(`path_img is empty.`)
    if (path.extname(path_img).toLowerCase() == '.gif') return path_img
    
    let dimensions = sizeOf(path_img)
    let path_res = path_img

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
    }

    return path_res
  }

  function downloadImg(src) {
    let name = 'ol-' + Date.now() + '.png'
    let dest = path.join(dir_images, name)
    let new_path = ''
    
    let ws = fs.ensureWriteStreamSync(dest)

    request(src).pipe(ws)
      
    ws.on('finish', () => {
      dest = fixExt(dest)
      new_path = path.relative(dir_post, dest)

      diff_list.push({
        origin: src,
        new: new_path,
        from: false,
        to: dest 
      }) 

      ep.emit('download', new_path)

    }).on('error', (err) => {
      log.error(`Download ${src} failed.`)
    })

  }
  

  function replaceAll(str, mapObj){
    var re = new RegExp(Object.keys(mapObj).join("|"),"gi");

    return str.replace(re, function(matched){
      return mapObj[matched.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")];
    });
  }


  
})

//将相对地址转为绝对地址
hexo.extend.filter.register('before_post_render', function(data){
  const config = this.config.easy_images
  var dir_post = path.join(this.source_dir, data.source)
  var pattern = /!\[(.*?)\]\((.*?)\)/g

  data.content = data.content.replace(pattern, (match, alt, src) => {
    let path_img = path.resolve(dir_post, '..', src)

    src_new = path_img.replace(this.source_dir, '/')
    
    if (config && config.cdn_prefix) {
       src_new = config.cdn_prefix + src_new
    }

    return `![${alt}](${src_new})`
  })

  return data;
});
