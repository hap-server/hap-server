declare module 'vue-loader/lib/plugin' {
    const VueLoaderPlugin: any;
    export = VueLoaderPlugin;
}

declare module 'html-webpack-plugin' {
    const HtmlWebpackPlugin: any;
    export = HtmlWebpackPlugin;
}

declare module 'webpack-subresource-integrity' {
    const SriPlugin: any;
    export = SriPlugin;
}

declare module 'script-ext-html-webpack-plugin' {
    const ScriptExtHtmlPlugin: any;
    export = ScriptExtHtmlPlugin;
}

declare module 'mini-css-extract-plugin' {
    const MiniCssExtractPlugin: any;
    export default MiniCssExtractPlugin;
}

declare module 'terser-webpack-plugin' {
    const TerserPlugin: any;
    export default TerserPlugin;
}

declare module 'optimize-css-assets-webpack-plugin' {
    const OptimizeCSSAssetsPlugin: any;
    export = OptimizeCSSAssetsPlugin;
}

declare module 'webpack/lib/HotModuleReplacementPlugin' {
    const HotModuleReplacementPlugin: any;
    export = HotModuleReplacementPlugin;
}
