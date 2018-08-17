var os = require('os')
var fs = require('hexo-fs');
var del = require('del') 
var path = require('path')
var request = require('request');
var log = require('hexo-log')({
  debug: false,
  silent: false
});

hexo.extend.processor.register('posts/:id.md', function(file) {
  var config = this.config.download_images

  console.log(file)
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
  //console.log(this)
  absolute_images.map(img => {
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

  function downloadImg(src) {
    let name = 'ol-' + Date.now() + '.png'
    let dest = path.join(dir_images, name)
    let new_path = path.relative(dir_post, dest)
    
    if (request(src).pipe(fs.ensureWriteStreamSync(dest))) {
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
    if (info.to && info.from != info.to) {
      fs.copyFile(info.from, info.to)
    }
    info.origin = info.origin.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")
    mapObj[info.origin] = info.new 
  })

  function replaceAll(str, mapObj){
    var re = new RegExp(Object.keys(mapObj).join("|"),"gi");

    return str.replace(re, function(matched){
      console.log(matched)
      return mapObj[matched.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")];
    });
  }

  content = replaceAll(content, mapObj) 
  fs.writeFile(file.source, content)

  return file
})
