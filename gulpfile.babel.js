import gulp from 'gulp';
import pump from 'pump';
import babel from 'gulp-babel';
import webpack from 'webpack-stream';

import VueLoaderPlugin from 'vue-loader/lib/plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

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
        gulp.src('src/public/index.js'),
        gulp.src('src/public/scss/index.scss'),
        webpack(Object.assign({watch: true}, webpack_config)),
        gulp.dest('dist/public'),
    ]);
});

gulp.task('watch-example-plugins', gulp.series('build-example-plugins', function () {
    return gulp.watch('example-plugins/src/**/*.js*', gulp.series('build-example-plugins'));
}));

gulp.task('watch', gulp.parallel('watch-backend', 'watch-frontend', 'watch-example-plugins'));
