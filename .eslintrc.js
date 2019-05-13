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
        'max-len': ['warn', {code: 120, ignoreComments: true}],
        // 'require-jsdoc': 'warn',
        'arrow-parens': ['warn', 'as-needed'],
        'quote-props': ['warn', 'consistent-as-needed'],

        'require-jsdoc': 'off',
        'valid-jsdoc': 'off',

        'vue/html-indent': ['error', 4, {
            alignAttributesVertically: false,
        }],
        'vue/html-self-closing': ['warn', {
            html: {
                void: 'always',
                normal: 'any',
            },
        }],
        'vue/script-indent': ['error', 4, {
            baseIndent: 1,
            switchCase: 0,
            ignores: [],
        }],
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
    ],
};
