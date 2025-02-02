const { expect } = require('chai');
const NoirDocParser = require('./noir_doc_generator');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('NoirDocParser', () => {
    let parser;
    let tempDir;

    beforeEach(() => {
        parser = new NoirDocParser();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noir-doc-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should parse struct documentation', () => {
        const code = `
            #[doc = "Test struct"]
            pub struct TestStruct {
                #[doc = "Test field"]
                value: Field
            }
        `;

        const testFile = path.join(tempDir, 'test.nr');
        fs.writeFileSync(testFile, code);

        parser.parseFile(testFile);
        const markdown = parser.generateMarkdown();

        expect(markdown).to.include('Test struct');
        expect(markdown).to.include('Test field');
    });

    it('should parse function documentation', () => {
        const code = `
            #[doc = "Test function"]
            #[example = "example code"]
            pub fn test_func(value: Field) -> Field {
                value
            }
        `;

        const testFile = path.join(tempDir, 'test.nr');
        fs.writeFileSync(testFile, code);

        parser.parseFile(testFile);
        const markdown = parser.generateMarkdown();

        expect(markdown).to.include('Test function');
        expect(markdown).to.include('example code');
    });

    it('should handle docs:start and docs:end tags', () => {
        const code = `
            // docs:start:test
            #[doc = "Test content"]
            pub fn test() {}
            // docs:end:test
        `;

        const testFile = path.join(tempDir, 'test.nr');
        fs.writeFileSync(testFile, code);

        parser.parseFile(testFile);
        const markdown = parser.generateMarkdown();

        expect(markdown).to.include('Test content');
    });

    it('should parse real aztec.nr code', () => {
        const code = `
            #[doc = "Represents a hash of data"]
            pub struct Hash {
                #[doc = "The inner value of the hash"]
                inner: Field
            }

            impl Hash {
                #[doc = "Creates a new hash from a field value"]
                #[example = "let hash = Hash::new(field_value);"]
                pub fn new(value: Field) -> Hash {
                    Hash { inner: value }
                }

                #[doc = "Converts the hash to a field value"]
                pub fn to_field(&self) -> Field {
                    self.inner
                }
            }
        `;

        const testFile = path.join(tempDir, 'hash.nr');
        fs.writeFileSync(testFile, code);

        parser.parseFile(testFile);
        const markdown = parser.generateMarkdown();

        // Check struct documentation
        expect(markdown).to.include('Represents a hash of data');
        expect(markdown).to.include('The inner value of the hash');

        // Check function documentation
        expect(markdown).to.include('Creates a new hash from a field value');
        expect(markdown).to.include('let hash = Hash::new(field_value);');
        expect(markdown).to.include('Converts the hash to a field value');

        // Check structure
        expect(markdown).to.include('## Struct `Hash`');
        expect(markdown).to.include('## Function `new`');
        expect(markdown).to.include('## Function `to_field`');
    });
});
