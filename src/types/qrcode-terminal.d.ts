declare module 'qrcode-terminal' {
    export const error: ErrorCorrectionLevel; // QRErrorCorrectLevel.L

    export function generate(input: string, opts?: Options, callback?: (output: string) => void): void;
    export function generate(input: string, callback?: (output: string) => void): void;

    export function setErrorLevel(error: keyof typeof ErrorCorrectionLevel): void;

    interface Options {
        small?: boolean;
    }

    enum ErrorCorrectionLevel {
        L = 1,
        M = 0,
        Q = 3,
        H = 2,
    }

    export {};
}
