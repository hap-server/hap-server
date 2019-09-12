module.exports = {
    extends: [
        'google',
        'plugin:vue/recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    plugins: [
        '@typescript-eslint',
    ],
    parserOptions: {
        ecmaVersion: 8,
        sourceType: 'module',

        // https://eslint.vuejs.org/user-guide/#how-to-use-custom-parser
        parser: 'babel-eslint',
    },
    rules: {
        indent: ['error', 4],
        camelcase: 'off',
        'max-len': ['warn', {code: 120, ignoreComments: true}],
        'arrow-parens': ['warn', 'as-needed'],
        'quote-props': ['warn', 'consistent-as-needed'],

        'require-jsdoc': 'off',

        'vue/html-indent': ['error', 4, {
            alignAttributesVertically: false,
        }],
        'vue/html-self-closing': ['warn', {
            html: {
                void: 'always',
                normal: 'any',
            },
        }],
        // 'vue/script-indent': ['error', 4, {
        //     baseIndent: 1,
        //     switchCase: 0,
        //     ignores: [],
        // }],
        'vue/script-indent': 'off',
        'vue/max-attributes-per-line': 'off',
        'vue/singleline-html-element-content-newline': 'off',

        // Self closing elements should have the closing bracket on the same line.
        // Elements which have content should have the closing bracket on the next line if the last attribute is not
        // on the same line as the opening bracket.
        'vue/html-closing-bracket-newline': 'off',

        'vue/multiline-html-element-content-newline': ['warn', {
            ignores: ['p', 'button'],
        }],
    },
    overrides: [
        {
            files: ['*.vue'],
            rules: {
                'indent': 'off',
            },
        },
        {
            files: ['*.ts'],
            parserOptions: {
                // https://eslint.vuejs.org/user-guide/#how-to-use-custom-parser
                parser: '@typescript-eslint/parser',
            },
            rules: {
                'indent': 'off',
                '@typescript-eslint/indent': ['error', 4],
                '@typescript-eslint/camelcase': 'off',
                '@typescript-eslint/no-var-requires': 'warn',

                '@typescript-eslint/no-use-before-define': 'off',

                '@typescript-eslint/ban-ts-ignore': 'warn',

                'vue/no-duplicate-attributes': 'off',
                'vue/no-template-key': 'off',
                'vue/no-textarea-mustache': 'off',
                'vue/no-unused-components': 'off',
                'vue/no-unused-vars': 'off',
                'vue/no-use-v-if-with-v-for': 'off',
                'vue/require-component-is': 'off',
                'vue/require-v-for-key': 'off',
                'vue/use-v-on-exact': 'off',
                'vue/valid-v-bind': 'off',
                'vue/valid-v-cloak': 'off',
                'vue/valid-v-else-if': 'off',
                'vue/valid-v-else': 'off',
                'vue/valid-v-for': 'off',
                'vue/valid-v-html': 'off',
                'vue/valid-v-if': 'off',
                'vue/valid-v-model': 'off',
                'vue/valid-v-on': 'off',
                'vue/valid-v-once': 'off',
                'vue/valid-v-pre': 'off',
                'vue/valid-v-show': 'off',
                'vue/valid-v-text': 'off',
                'vue/attribute-hyphenation': 'off',
                'vue/html-closing-bracket-spacing': 'off',
                'vue/html-end-tags': 'off',
                'vue/html-indent': 'off',
                'vue/html-quotes': 'off',
                'vue/html-self-closing': 'off',
                'vue/multiline-html-element-content-newline': 'off',
                'vue/mustache-interpolation-spacing': 'off',
                'vue/no-spaces-around-equal-signs-in-attribute': 'off',
                'vue/no-template-shadow': 'off',
                'vue/v-bind-style': 'off',
                'vue/v-on-style': 'off',
                'vue/attributes-order': 'off',
                'vue/no-v-html': 'off',
                'vue/this-in-template': 'off',
                'vue/no-multi-spaces': 'off',
            },
        },
    ],
};
