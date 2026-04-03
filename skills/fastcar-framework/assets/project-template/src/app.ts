import "reflect-metadata";
import { FastCarApplication } from "@fastcar/core";
import { Application, ApplicationStart } from "@fastcar/core/annotation";

@Application
class App {
  app!: FastCarApplication;

  @ApplicationStart
  async start() {
    console.log("✅ FastCar 应用启动成功!");
    console.log(`📊 内存使用: ${JSON.stringify(this.app.getMemoryUsage())}`);
  }
}

// 启动应用
const app = new App();
app.start();
