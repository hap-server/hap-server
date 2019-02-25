import gulp from 'gulp';
import pump from 'pump';
import babel from 'gulp-babel';
import webpack from 'webpack-stream';

import VueLoaderPlugin from 'vue-loader/lib/plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';

const webpack_config = {
    mode: 'development',
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: 'vue-loader',
            },
        ],
    },
    plugins: [
        new VueLoaderPlugin(),
        new HtmlWebpackPlugin({
            template: 'src/public/index.html',
        }),
    ],
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
        gulp.src('src/index.js'),
        webpack(webpack_config),
        gulp.dest('dist/public'),
    ]);
});

gulp.task('build', gulp.parallel('build-backend', 'build-frontend'));

gulp.task('watch-backend', gulp.series('build-backend', function () {
    return gulp.watch(['src/*.js', 'src/**/*.js'], gulp.series('build-backend'));
}));

gulp.task('watch-frontend', function () {
    return pump([
        gulp.src('src/public/index.js'),
        webpack(Object.assign({watch: true}, webpack_config)),
        gulp.dest('dist/public'),
    ]);
});

gulp.task('watch', gulp.parallel('watch-backend', 'watch-frontend'));
