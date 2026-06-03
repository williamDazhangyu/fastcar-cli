declare module "inquirer" {
  export type Answers = Record<string, unknown>;

  export interface PromptQuestion<TAnswers extends Answers = Answers>
    extends Record<string, unknown> {
    type?: string;
    name?: string;
    message?: string;
    default?: unknown;
    choices?: unknown;
    when?: unknown;
    validate?: (value: any, answers?: TAnswers) => true | string | Promise<true | string>;
    filter?: (value: any, answers?: TAnswers) => unknown;
    transformer?: unknown;
    pageSize?: number;
    prefix?: string;
    suffix?: string;
    mask?: string;
  }

  export type QuestionCollection<TAnswers extends Answers = Answers> =
    | PromptQuestion<TAnswers>
    | Array<PromptQuestion<TAnswers> | Record<string, unknown>>
    | Record<string, PromptQuestion<TAnswers> | Record<string, unknown>>;

  export function prompt<TAnswers extends Answers = Answers>(
    questions: QuestionCollection<TAnswers>,
  ): Promise<TAnswers>;

  const inquirer: {
    prompt: typeof prompt;
  };

  export default inquirer;
}
