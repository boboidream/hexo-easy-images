var os = require('os')
var fs = require('hexo-fs');
var del = require('del') 
var path = require('path')
var request = require('request');
const readChunk = require('read-chunk'); 
const imageType = require('image-type');
const sharp = require('sharp');
const sizeOf = require('image-size');
var log = require('hexo-log')({
  debug: false,
  silent: false
});

const config = this.config.download_images


hexo.extend.processor.register('posts/:id.md', function(file) {
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

  function fixExt(path_img) {
    let buffer = readChunk.sync(path_img, 0, 12);
    let origin_ext = path.extname(path_img) 
    let real = imageType(buffer);
    let path_res = path_img

    if (origin_ext != real.ext) {
      path_res = path_img.replace(origin_ext, real.ext)

      if (fs.renameSync(path_img, path_res)) {
        log.info(`Fix ${path_img}` to `${real.ext} success!`)
      } else {
        log.error(`Rename ${path_img} error.`)
      }      
    }

    return path_res
  }

  function resizeImg(path_img, w, h) {
    if (path.extname(path_img).toLowerCase() == '.gif') return path_img
    
    let dimensions = sizeOf(path_img)

    if (dimensions.width > w or dimensions.height > h) {
      let path_res = path_img
      let img_ext = path.extname(path_img)
      
      path_res = path_img.replace(img_ext, '-s' + img_ext) 
      sharp(path_img)
        .resize(w, h)
        .max()
        .withoutEnlargement()
        .toFile(path_res)
        .catch(e => log.error(e))
    }

    return path_res
  }

  function downloadImg(src) {
    let name = 'ol-' + Date.now() + '.png'
    let dest = path.join(dir_images, name)
    let new_path = ''
    
    if (request(src).pipe(fs.ensureWriteStreamSync(dest))) {
      dest = fixExt(dest)
      new_path = path.relative(dir_post, dest)

      diff_list.push({
        origin: src,
        new: new_path,
        from: false,
        to: false
      }) 
    } else {
      log.error(`Download ${src} failed.`)
    }

  }
  
  var mapObj = {}

  diff_list.forEach(info => {
    //Copy 本地图片
    if (info.to && info.from != info.to) {
      fs.copyFile(info.from, info.to)
      info.to = fixExt(info.to)
    }

    //压缩图片
    if (config.max_width || config.max_height){
      info.to = resizeImg(info.to, config.max_width, config.max_height)
    }

    //替换图片新地址
    if (info.new && info.origin != info.new) {
      info.origin = info.origin.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")
      mapObj[info.origin] = info.new 
    }
  })

  function replaceAll(str, mapObj){
    var re = new RegExp(Object.keys(mapObj).join("|"),"gi");

    return str.replace(re, function(matched){
      console.log(matched)
      return mapObj[matched.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")];
    });
  }

  
  if (Object.keys(mapObj).length) content = replaceAll(content, mapObj) 

  fs.writeFile(file.source, content)

  file.type = 'update'

  return file
})

//将相对地址转为绝对地址
hexo.extend.filter.register('before_post_render', function(data){
  var dir_post = path.join(this.source_dir, data.source)
  var pattern = /!\[(.*?)\]\((.*?)\)/g

  data.content = data.content.replace(pattern, (match, alt, src) => {
    let path_img = path.resolve(dir_post, '..', src)

    src_new = path_img.replace(this.source_dir, '/')
    
    if (config && config.cdn_prefix) {
      src_new = path.join(cdn_prefix, src_new)
    }

    return `![${alt}](${src_new})`
  })

  console.log(data.content)
  return data;
});
