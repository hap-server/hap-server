import path from 'path';
import url from 'url';

import gulp from 'gulp';
import pump from 'pump';
import watch from 'gulp-watch';
import plumber from 'gulp-plumber';
import sourcemaps from 'gulp-sourcemaps';
import babel from 'gulp-babel';
import typescript from 'gulp-typescript';
import webpack from 'webpack-stream';
import json from 'gulp-json-editor';
import file from 'gulp-file';
import minify from 'gulp-minify';
import replace from 'gulp-replace';
import merge from 'merge2';
import del from 'del';
import markdownlinks from 'transform-markdown-links';

import VueLoaderPlugin from 'vue-loader/lib/plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import SriPlugin from 'webpack-subresource-integrity';
import ScriptExtHtmlPlugin from 'script-ext-html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import OptimizeCSSAssetsPlugin from 'optimize-css-assets-webpack-plugin';
import HotModuleReplacementPlugin from 'webpack/lib/HotModuleReplacementPlugin';

const README_BASE_URL =
    `https://gitlab.fancy.org.uk/hap-server/hap-server/blob/v${require('./package').version}/README.md`;
const README_IMAGE_BASE_URL =
    `https://gitlab.fancy.org.uk/hap-server/hap-server/raw/v${require('./package').version}/README.md`;

import {compilerOptions as typescript_config} from './tsconfig';

const webpack_config = {
    context: __dirname,
    mode: 'development',
    entry: {
        main: [
            path.join(__dirname, 'src/public/scss/index.scss'),
            path.join(__dirname, 'src/public/index.ts'),
        ],
        modal: [
            path.join(__dirname, 'src/public/scss/index.scss'),
            path.join(__dirname, 'src/public/modal.ts'),
        ],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                options: {
                    compilerOptions: Object.assign({}, typescript_config, {
                        declaration: false,
                    }),
                },
            },
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
            {
                test: /\.(png|jpg|gif)$/,
                loader: 'file-loader',
            },
        ],
    },
    plugins: [
        new VueLoaderPlugin(),
        new HtmlWebpackPlugin({
            template: 'src/public/index.html',
            chunks: ['runtime', 'vendors', 'main'],
        }),
        new HtmlWebpackPlugin({
            template: 'src/public/app.html',
            filename: 'app.html',
            chunks: ['runtime', 'vendors', 'main'],
        }),
        new HtmlWebpackPlugin({
            template: 'src/public/modal.html',
            filename: 'modal.html',
            chunks: ['runtime', 'vendors', 'modal'],
        }),
        new ScriptExtHtmlPlugin({
            prefetch: {
                test: /\.js$/,
                chunks: 'async',
            },
            custom: {
                test: /\.js$/,
                attribute: 'crossorigin',
                value: 'anonymous',
            },
        }),
        new MiniCssExtractPlugin({
            // Options similar to the same options in webpackOptions.output
            // both options are optional
            filename: '[name].css',
            chunkFilename: '[id].css',
        }),
    ],
    resolve: {
        // Add `.ts` and `.tsx` as a resolvable extension
        extensions: ['.ts', '.tsx', '.js', '.json'],
        alias: {
            // Include the template compiler for plugin with accessory UIs
            'vue$': 'vue/dist/vue.esm.js', // 'vue/dist/vue.common.js' for webpack 1
        },
    },
    output: {
        filename: '[name].js',
        crossOriginLoading: 'anonymous',
    },
    optimization: {
        runtimeChunk: 'single',
        splitChunks: {
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'initial',
                },
            },
        },
    },
};

export const webpack_hot_config = Object.assign({}, webpack_config, {
    entry: {
        main: [
            'webpack-hot-middleware/client',
            path.join(__dirname, 'src/public/scss/index.scss'),
            path.join(__dirname, 'src/public/index.ts'),
        ],
        modal: [
            'webpack-hot-middleware/client',
            path.join(__dirname, 'src/public/scss/index.scss'),
            path.join(__dirname, 'src/public/modal.ts'),
        ],
    },
    module: Object.assign({}, webpack_config.module, {
        rules: webpack_config.module.rules.map((rule, i) => i === 1 ? {
            test: /\.(s?c|sa)ss$/,
            use: [
                'style-loader',
                'css-loader',
                'sass-loader',
            ],
        } : rule),
    }),
    plugins: webpack_config.plugins.concat([
        new HotModuleReplacementPlugin(),
    ]),
});

gulp.task('build-backend-no-ts', function () {
    return pump([
        merge([
            pump([
                gulp.src(['src/**/*.js', '!src/public/**/*.js']),
                sourcemaps.init(),
                babel(),
                sourcemaps.write('.', {includeContent: false, destPath: 'dist'}),
            ]),
            gulp.src(['src/**/*', '!src/public/**/*', '!src/**/*.js', '!src/**/*.ts']),
        ]),
        gulp.dest('dist'),
    ]);
});

const tsProject = typescript.createProject(typescript_config);

gulp.task('build-backend', function () {
    return pump([
        merge([
            pump([
                gulp.src(['src/**/*.js', '!src/public/**/*.js']),
                sourcemaps.init(),
                babel(),
                sourcemaps.write('.', {includeContent: false, destPath: 'dist'}),
            ]),
            pump([
                gulp.src(['src/**/*.ts', '!src/public/**/*.ts']),
                sourcemaps.init(),
                tsProject(),
                sourcemaps.write('.', {includeContent: false, destPath: 'dist'}),
            ]),
            gulp.src(['src/**/*', '!src/public/**/*', '!src/**/*.js', '!src/**/*.ts']),
        ]),
        gulp.dest('dist'),
    ]);
});

gulp.task('build-frontend', function () {
    return pump([
        gulp.src('src/public/scss/index.scss'),
        gulp.src('src/public/index.ts'),
        webpack(webpack_config),
        gulp.dest('dist/public'),
    ]);
});

gulp.task('build-example-plugins', function () {
    return pump([
        gulp.src('example-plugins/src/**/*.js'),
        sourcemaps.init(),
        babel(),
        sourcemaps.write('.', {includeContent: false, destPath: 'example-plugins/dist'}),
        gulp.src('example-plugins/src/**/*.json'),
        gulp.dest('example-plugins/dist'),
    ]);
});

gulp.task('build', gulp.parallel('build-backend', 'build-frontend', 'build-example-plugins'));

gulp.task('watch-backend-no-ts', function () {
    return pump([
        watch(['src/**/*.js', '!src/public/**/*.js'], {verbose: true}),
        plumber(),
        sourcemaps.init(),
        babel(),
        sourcemaps.write('.', {includeContent: false, destPath: 'dist'}),
        watch(['src/**/*', '!src/public/**/*', '!src/**/*.js', '!src/**/*.ts'], {verbose: true}),
        gulp.dest('dist'),
    ]);
});

gulp.task('watch-backend', gulp.parallel('watch-backend-no-ts', function () {
    return gulp.watch(['src/**/*.ts', '!src/public/**/*.ts'], function () {
        return pump([
            gulp.src(['src/**/*.ts', '!src/public/**/*.ts']),
            sourcemaps.init(),
            tsProject(),
            sourcemaps.write('.', {includeContent: false, destPath: 'dist'}),
            gulp.dest('dist'),
        ]);
    });
}));

gulp.task('watch-frontend', function () {
    return pump([
        gulp.src('src/public/scss/index.scss'),
        gulp.src('src/public/index.ts'),
        webpack(Object.assign({watch: true}, webpack_config)),
        gulp.dest('dist/public'),
    ]);
});

gulp.task('watch-example-plugins', function () {
    return pump([
        watch('example-plugins/src/**/*.js', {verbose: true}),
        plumber(),
        sourcemaps.init(),
        babel(),
        sourcemaps.write('.', {includeContent: false, destPath: 'example-plugins/dist'}),
        watch('example-plugins/src/**/*.json', {verbose: true}),
        gulp.dest('example-plugins/dist'),
    ]);
});

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
    plugins: (webpack_config.plugins || []).filter(plugin => !(plugin instanceof MiniCssExtractPlugin)).concat([
        new MiniCssExtractPlugin({
            // Options similar to the same options in webpackOptions.output
            // both options are optional
            filename: '[hash].css',
            chunkFilename: '[id].[hash].css',
        }),
        new SriPlugin({
            hashFuncNames: ['sha256', 'sha384'],
        }),
    ]),
    output: {
        crossOriginLoading: 'anonymous',
    },
    optimization: Object.assign({}, webpack_config.optimization, {
        minimizer: [
            new TerserPlugin(),
            new OptimizeCSSAssetsPlugin(),
        ],
    }),
});

gulp.task('build-backend-release', function () {
    return pump([
        gulp.src(['src/**/*.js', '!src/public/**/*.js']),
        replace(/\bDEVELOPMENT\s*=\s*true\b/gi, 'DEVELOPMENT = false'),
        replace(/\bDEVELOPMENT(?!\s*=)\b/gi, 'false'),
        babel(),
        minify(release_minify_config),
        gulp.dest('release'),
    ]);
});

gulp.task('build-frontend-release', function () {
    return pump([
        gulp.src('src/public/scss/index.scss'),
        gulp.src('src/public/index.ts'),
        webpack(release_webpack_config),
        gulp.dest('release/public'),
    ]);
});

gulp.task('copy-release-executables', function () {
    return pump([
        file('hap-server',
            `#!/usr/bin/env node\n` +
            `process.title = 'hap-server';\n` +
            `require('../cli').default.argv;\n`, {src: true}),
        file('hap-server-completion',
            `#!/usr/bin/env node\n` +
            `require('../cli').default.showCompletionScript();\n`),

        gulp.dest('release/bin', {
            mode: 0o755,
        }),
    ]);
});

gulp.task('release-package', function () {
    return pump([
        gulp.src('package.json'),
        json(packagejson => {
            packagejson.private = false;
            packagejson.main = 'index.js';
            packagejson.types = 'index.d.ts';
            packagejson.dependencies['@hap-server/api'] = 'file:types/api';
            packagejson.dependencies['@hap-server/ui-api'] = 'file:types/ui-api';
            packagejson.devDependencies = [];
            packagejson.scripts = {
                start: 'bin/hap-server',
            };
            return packagejson;
        }),
        gulp.dest('release'),
    ]);
});

gulp.task('release-readme', function () {
    return pump([
        gulp.src('README.md'),
        replace(/^(.|\n)+$/, input => markdownlinks(input, (link, title) =>
            url.resolve(title.match(/Screenshot/) ? README_IMAGE_BASE_URL : README_BASE_URL, link))),
        gulp.dest('release'),
    ]);
});

gulp.task('copy-release-files', gulp.parallel('release-package', 'release-readme', function () {
    return pump([
        gulp.src('LICENSE'),

        gulp.dest('release'),
    ]);
}));

gulp.task('build-release', gulp.parallel('build-backend-release', 'build-frontend-release', 'copy-release-executables', 'copy-release-files'));

gulp.task('clean-release', gulp.series(function () {
    return del(['release']);
}, 'build-release'));
