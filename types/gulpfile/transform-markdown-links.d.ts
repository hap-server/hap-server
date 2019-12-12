declare module 'transform-markdown-links' {
    type TransformCallback = (url: string, text: string) => string | null | undefined;

    function transformLinks(input: string, transform: TransformCallback): string;

    export = transformLinks;
}
