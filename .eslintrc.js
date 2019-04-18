module.exports = {
    extends: [
        'google',
        'plugin:vue/recommended',
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
        'max-len': ['warn', {code: 120}],
        // 'require-jsdoc': 'warn',
        'arrow-parens': ['warn', 'as-needed'],

        'require-jsdoc': 'off',
        'valid-jsdoc': 'off',

        'vue/html-indent': ['error', 4, {
            alignAttributesVertically: false,
        }],
        'vue/html-self-closing': ['warn', {
            html: {
                normal: 'any',
            },
        }],
        'vue/script-indent': ['error', 4, {
            baseIndent: 1,
            switchCase: 0,
            ignores: [],
        }],
    },
    overrides: [
        {
            files: ['*.vue'],
            rules: {
                'indent': 'off',
            },
        },
    ],
};
