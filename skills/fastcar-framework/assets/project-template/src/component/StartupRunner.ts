import { Component } from "@fastcar/core/annotation";
import { ApplicationStart, ApplicationStop } from "@fastcar/core/annotation";

@Component
export default class StartupRunner {
  @ApplicationStart(100)
  async onStart() {
    console.log("🚀 应用初始化完成");
  }

  @ApplicationStop
  async onStop() {
    console.log("👋 应用正在关闭...");
  }
}
