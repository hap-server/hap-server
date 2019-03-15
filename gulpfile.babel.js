import gulp from 'gulp';
import pump from 'pump';
import babel from 'gulp-babel';
import webpack from 'webpack-stream';
import json from 'gulp-json-editor';
import file from 'gulp-file';
import minify from 'gulp-minify';

import VueLoaderPlugin from 'vue-loader/lib/plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import OptimizeCSSAssetsPlugin from 'optimize-css-assets-webpack-plugin';

const webpack_config = {
    mode: 'development',
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: 'vue-loader',
            },
            {
                test: /\.(s?c|sa)ss$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader,
                        options: {
                            // you can specify a publicPath here
                            // by default it use publicPath in webpackOptions.output
                            publicPath: '../',
                        },
                    },
                    'css-loader',
                    'sass-loader',
                ],
            },
        ],
    },
    plugins: [
        new VueLoaderPlugin(),
        new HtmlWebpackPlugin({
            template: 'src/public/index.html',
        }),
        new MiniCssExtractPlugin({
            // Options similar to the same options in webpackOptions.output
            // both options are optional
            filename: '[name].css',
            chunkFilename: '[id].css',
        }),
    ],
    resolve: {
        alias: {
            // Include the template compiler for plugin with accessory UIs
            'vue$': 'vue/dist/vue.esm.js', // 'vue/dist/vue.common.js' for webpack 1
        },
    },
    output: {
        filename: '[name].js',
    },
};

gulp.task('build-backend', gulp.parallel(function () {
    return pump([
        gulp.src('src/*.js'),
        babel(),
        gulp.dest('dist'),
    ]);
}, function () {
    return pump([
        gulp.src('src/core/**/*.js'),
        babel(),
        gulp.dest('dist/core'),
    ]);
}));

gulp.task('build-frontend', function () {
    return pump([
        gulp.src('src/public/scss/index.scss'),
        gulp.src('src/public/index.js'),
        webpack(webpack_config),
        gulp.dest('dist/public'),
    ]);
});

gulp.task('build-example-plugins', gulp.parallel(function () {
    return pump([
        gulp.src('example-plugins/src/**/*.js'),
        babel(),
        gulp.dest('example-plugins/dist'),
    ]);
}, function () {
    return pump([
        gulp.src('example-plugins/src/**/*.json'),
        gulp.dest('example-plugins/dist'),
    ]);
}));

gulp.task('build', gulp.parallel('build-backend', 'build-frontend', 'build-example-plugins'));

gulp.task('watch-backend', gulp.series('build-backend', function () {
    return gulp.watch(['src/*.js', 'src/core/**/*.js'], gulp.series('build-backend'));
}));

gulp.task('watch-frontend', function () {
    return pump([
        gulp.src('src/public/scss/index.scss'),
        gulp.src('src/public/index.js'),
        webpack(Object.assign({watch: true}, webpack_config)),
        gulp.dest('dist/public'),
    ]);
});

gulp.task('watch-example-plugins', gulp.series('build-example-plugins', function () {
    return gulp.watch('example-plugins/src/**/*.js*', gulp.series('build-example-plugins'));
}));

gulp.task('watch', gulp.parallel('watch-backend', 'watch-frontend', 'watch-example-plugins'));

const release_minify_config = {
    ext: {
        min: '.js',
    },
    noSource: true,
    mangle: {
        keep_classnames: true,
        module: true,
    },
};

const release_webpack_config = Object.assign({}, webpack_config, {
    mode: 'production',
    output: undefined,
    optimization: {
        minimizer: [
            new TerserPlugin(),
            new OptimizeCSSAssetsPlugin(),
        ],
    },
});

gulp.task('build-backend-release', gulp.parallel(function () {
    return pump([
        gulp.src('src/index.js'),
        gulp.src('src/cli.js'),
        babel(),
        minify(release_minify_config),
        gulp.dest('release'),
    ]);
}, function () {
    return pump([
        gulp.src('src/core/**/*.js'),
        babel(),
        minify(release_minify_config),
        gulp.dest('release/core'),
    ]);
}));

gulp.task('build-frontend-release', function () {
    return pump([
        gulp.src('src/public/scss/index.scss'),
        gulp.src('src/public/index.js'),
        webpack(release_webpack_config),
        gulp.dest('release/public'),
    ]);
});

gulp.task('copy-release-executables', function () {
    return pump([
        file('hap-server',
            `#!/usr/bin/env node\n` +
            `process.title = 'hap-server';\n` +
            `require('../cli');\n`, {src: true}),

        gulp.dest('release/bin', {
            mode: 0o755,
        }),
    ]);
});

gulp.task('copy-release-files', function () {
    return pump([
        gulp.src('package.json'),
        json({
            main: 'index.js',
            files: [
                'index.js',
                'cli.js',
            ],
            devDependencies: [],
            scripts: {
                start: 'bin/hap-server',
            },
        }),

        gulp.src('README.md'),

        gulp.dest('release'),
    ]);
});

gulp.task('build-release', gulp.parallel('build-backend-release', 'build-frontend-release', 'copy-release-executables', 'copy-release-files'));
