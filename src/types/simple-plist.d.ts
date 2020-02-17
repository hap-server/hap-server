/// <reference path="./bplist-parser.d.ts" />
/// <reference path="./bplist-creator.d.ts" />

declare module 'simple-plist' {
    import bplistParser = require('bplist-parser');
    import bplistCreator = require('bplist-creator');
    import plist = require('plist');
    import {WriteFileOptions} from 'fs';

    export {bplistCreator, bplistParser};

    export function parse(aStringOrBuffer: string | Buffer, aFile?: string): unknown;

    export {plist};

    export function readFile(aFile: string, callback: {
        (err: Error): void;
        (err: null, results: unknown): void;
    }): void;
    export function readFileSync(aFile: string): unknown;

    export function stringify(anObject: any): string;

    export function writeBinaryFile(
        aFile: string, anObject: any, options: WriteFileOptions, callback: (err: NodeJS.ErrnoException | null) => void
    ): void;
    export function writeBinaryFile(
        aFile: string, anObject: any, callback: (err: NodeJS.ErrnoException | null) => void
    ): void;
    export function writeBinaryFileSync(aFile: string, anObject: any, options?: WriteFileOptions): void;

    export function writeFile(
        aFile: string, anObject: any, options: WriteFileOptions, callback: (err: NodeJS.ErrnoException | null) => void
    ): void;
    export function writeFile(
        aFile: string, anObject: any, callback: (err: NodeJS.ErrnoException | null) => void
    ): void;
    export function writeFileSync(aFile: string, anObject: any, options?: WriteFileOptions): void;
}
