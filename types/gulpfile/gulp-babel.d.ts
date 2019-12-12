declare module 'gulp-babel' {
    function transform(opts?: import('babel-core').TransformOptions): import('stream').Transform;

    export = transform;
}
