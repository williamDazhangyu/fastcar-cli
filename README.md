# fastcar 脚手架工具

## 快速安装

npm install fastcar-cli

## 全局安装

npm install -g fastcar-cli

## 常用命令

fastcar-cli -v //显示版本 fastcar-cli version 1.0.0

fastcar-cli -help //显示所有命令

fastcar-cli  init web //初始化web模板

fastcar-cli  clean node_modules //清除多余依赖库(一般使用不到)

fastcar-cli  compress node_modules //压缩依赖库(一般使用不到)

## web框架快速示例

* 安装环境 全局安装 typescript ts-node (确保ts和调试正常)

* 创建文件夹 mkdir demo

* 切换至该目录下 cd demo/

* 执行初始化流程  fastcar-cli init web

* 安装项目依赖  yarn install 或者 npm install

* 项目启动  npm run debug

* 访问根目录 <http://localhost:1234/>

* 查看api文档 <http://localhost:1234/api.docs>
