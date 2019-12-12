declare module 'gulp-file' {
    interface File {
        name: string;
        source: string | Buffer;
    }

    interface Options {
        /** Calls stream.end() to be used at the beginning of your pipeline in place of gulp.src() */
        src?: boolean;
    }

    function file(name: string, source: string | Buffer, options?: Options): import('stream').Transform;
    function file(files: File[], options?: Options): import('stream').Transform;

    export = file;
}
