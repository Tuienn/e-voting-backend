export default {
    extends: ['@commitlint/config-conventional'],

    parserPreset: {
        // Example: feat/#scope: subject
        parserOpts: { headerPattern: /^(\w+)\/#(\w+): (.*)$/, headerCorrespondence: ['type', 'scope', 'subject'] }
    },
    rules: {
        // Level 2 (error), always enforce, allowed types
        'type-enum': [
            2,
            'always',
            ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore', 'perf', 'ci', 'build', 'revert']
        ],
        // Level 0 (disable), never enforce, allowed scopes (optional)
        'subject-case': [0, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']]
    }
}
