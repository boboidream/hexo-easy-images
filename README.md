# hexo-easy-images
![node](https://img.shields.io/badge/node-%3E%3D8.7.0-green.svg)

Hexo 博客插件，post 中随意引用本地图片、远程图片，插件将自动处理图片 copy 与 download及引用路径，本地预览与线上都能完美显示图片。

### 安装
```bash
npm i hexo-easy-images -s
```

### 自定义配置

以下配置非必需，在 `your-hexo-project/_config.yml` 添加。

```yml
# Easy images
easy_images:
  init: false # 默认 false；改为 true，将处理过去所有 post，通常装插件后第一次运行时使用。
  cdn_prefix: http://yourcdn.com # 默认 null; 图片前缀，在生成 html 文件时为 image 添加前缀
  max_width: 800 # 默认 null；设置图片最大宽度
  max_height: 800 # 默认 null；设置图片最大高度
```

### 介绍
在书写 post 时，再也不用为插入图片问题担心了。只要你定义图片路径正确，无论是本地、在线、绝对路径、相对路径，统统不用担心。

本插件自动将 post 中使用到图片，copy 到 source/images/your_post_id 文件夹下，并将 post文件内图片引用路径改为本地相对路径，保证本地 Markdown 编辑器正确显示。

同时在生成 html 文件时，会将 html 中图片路径改为绝对路径。故，无论本地线上，图片都无需担心。

例如：post 内容如下

```md
---
title: Hello World
---

## 本地图片（绝对路径）
![test](/Users/zhangwenbo/Coding/hexo/public/img/2014-03-11.jpg)
![](~/Coding/hexo/public/img/2014-03-30-2.jpg)

## 本地图片（相对路径）
![](./2014-03-30.jpg)
![](../images/000.jpg)

## 在线图片
![小猫](https://images.unsplash.com/photo-1534201569625-ed4662d8be97?ixlib=rb-0.3.5&ixid=eyJhcHBfaWQiOjEyMDd9&s=1ff48aebbb7e08c289f8f738b5592f47&auto=format&fit=crop&w=400&q=60)

## CDN 图片
![艺](http://7xqmgi.com1.z0.glb.clouddn.com/img/2014-03-11.jpg)

无论哪种方式都能完美显示！
```

运行 `hexo g` 后，所有图片被 copy 或 download 到 `source/images/hello-world-2` 下，且 post 内容变为

```md
---
title: Hello World
---

## 本地图片（绝对路径）
![test](../images/hello-world-2/2014-03-11.jpg)
![](../images/hello-world-2/2014-03-30-2.jpg)

## 本地图片（相对路径）
![](../images/hello-world-2/2014-03-30.jpg)
![](../images/hello-world-2/000.jpg)

## 在线图片
![小猫](../images/hello-world-2/ol-1534652801825.jpg)

## CDN 图片
![艺](../images/hello-world-2/ol-1534652801828.jpg)

无论哪种方式都能完美显示！
```

生成的 html 文件为：
```html
<h2 id="本地图片（绝对路径）"><a href="#本地图片（绝对路径）" class="headerlink" title="本地图片（绝对路径）"></a>本地图片（绝对路径）</h2>
<p><img src="/images/hello-world-2/2014-03-11-s.jpg" alt="test"><br><img src="/images/hello-world-2/2014-03-30-2-s.jpg" alt=""></p>
<h2 id="本地图片（相对路径）"><a href="#本地图片（相对路径）" class="headerlink" title="本地图片（相对路径）"></a>本地图片（相对路径）</h2>
<p><img src="/images/hello-world-2/2014-03-30-s.jpg" alt=""><br><img src="/images/hello-world-2/000-s.jpg" alt=""></p>
<h2 id="在线图片"><a href="#在线图片" class="headerlink" title="在线图片"></a>在线图片</h2>
<p><img src="/images/hello-world-2/ol-1534652801825-s.jpg" alt="小猫"></p>
<h2 id="CDN-图片"><a href="#CDN-图片" class="headerlink" title="CDN 图片"></a>CDN 图片</h2>
<p><img src="/images/hello-world-2/ol-1534652801828-s.jpg" alt="艺"></p>
<p>无论哪种方式都能完美显示！</p>
```

如此，在本地还是线上地图片，都完美显示。

另可自定义生成压缩版（后缀为 `imgname-s.jpg`）图片。也可配置 `cnd_prefix` 则生成 html 图片路径将为：
```html
<h2 id="CDN-图片"><a href="#CDN-图片" class="headerlink" title="CDN 图片"></a>CDN 图片</h2>
<p><img src="http://yourcdn.com/images/hello-world-2/ol-1534652801828-s.jpg" alt="艺"></p>
```

## TODO
[-] 发布到 hexo 插件
[-] 在 windows 上测试

