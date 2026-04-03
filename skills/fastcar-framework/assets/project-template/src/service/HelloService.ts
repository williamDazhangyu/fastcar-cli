import { Service } from "@fastcar/core/annotation";

@Service
export default class HelloService {
  sayHello(name: string): string {
    return `Hello, ${name}! Welcome to FastCar.`;
  }

  getCurrentTime(): string {
    return new Date().toLocaleString("zh-CN");
  }
}
