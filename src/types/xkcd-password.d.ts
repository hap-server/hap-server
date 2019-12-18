declare module 'xkcd-password' {
    import {EventEmitter} from 'events';

    interface Options {
        numWords: number;
        minLength: number;
        maxLength: number;
    }

    type GenerateCallback = {
        (err: Error): void;
        (err: null, words: string[]): void;
    }

    class XKCDPassword extends EventEmitter {
        wordlist: string[] | null;
        wordfile: string | null;

        /** If we've got a wordlist at the ready. */
        ready: boolean;
        private initialized: boolean;

        constructor();

        initWithWordList(wordlist: string[]): this;
        private _initialize(): void;
        initWithWordFile(wordfile: string): this;

        generate(next: GenerateCallback): null;
        generate(options: Options, next: GenerateCallback): null;
        generate(numWords: number, next: GenerateCallback): null;
        generate(options: Options | number, next: GenerateCallback): null;
        generate(options: Options): Promise<string[]>;
        generate(numWords: number): Promise<string[]>;
        generate(options: Options | number): Promise<string[]>;
        private _generate(numWords: number, minLength: number, maxLength: number, next: GenerateCallback, deferred: unknown | null): void;
    }

    export = XKCDPassword;
}
