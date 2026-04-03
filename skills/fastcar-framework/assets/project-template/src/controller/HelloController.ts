import { Controller, Autowired } from "@fastcar/core/annotation";
import { GET, REQUEST } from "@fastcar/koa/annotation";
import HelloService from "../service/HelloService";

@Controller
@REQUEST("/hello")
export default class HelloController {
  @Autowired
  private helloService!: HelloService;

  @GET
  async index() {
    const message = this.helloService.sayHello("FastCar");
    return { message, timestamp: new Date().toISOString() };
  }

  @GET("/health")
  async health() {
    return { status: "ok", uptime: process.uptime() };
  }
}
