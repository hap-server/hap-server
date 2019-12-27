declare module 'gulp-minify' {
    interface MinifyOptions {
        ext?: {
            src?: string;
            min?: string;
        };
        exclude?: string[];
        ignoreFiles?: string[];
    }

    function minify(options?: MinifyOptions): import('stream').Duplex;

    export = minify;
}
