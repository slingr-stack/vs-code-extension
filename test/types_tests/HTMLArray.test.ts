import { Field, Model, BaseModel, HTML } from "../../index";

@Model({
    docs: "Test model for HTML decorator with array support",
})
class HTMLTestModel extends BaseModel {
    @Field({})
    @HTML()
    singleContent!: string;

    @Field({})
    @HTML()
    contentArray!: string[];

    @Field({ required: false })
    @HTML()
    optionalContentArray!: string[];
}

describe("HTML Decorator with Array Support", () => {
    it("should work with single string content", async () => {
        const model = new HTMLTestModel();
        model.singleContent = "<h1>Hello World</h1>";
        model.contentArray = ["<p>First paragraph</p>", "<p>Second paragraph</p>"];
        
        const errors = await model.validate();
        expect(errors).toHaveLength(0);
    });

    it("should validate string arrays with HTML content", async () => {
        const model = new HTMLTestModel();
        model.singleContent = "<h1>Title</h1>";
        model.contentArray = [
            "<div>Content 1</div>",
            "<span>Content 2</span>",
            "Plain text is also valid"
        ];
        
        const errors = await model.validate();
        expect(errors).toHaveLength(0);
    });

    it("should fail validation when array contains non-string elements", async () => {
        const model = new HTMLTestModel();
        model.singleContent = "<h1>Title</h1>";
        model.contentArray = [
            "<div>Valid content</div>",
            123 as any, // Invalid: number
            null as any // Invalid: null
        ];
        
        const errors = await model.validate();
        expect(errors.length).toBeGreaterThan(0);
        
        const arrayError = errors.find(e => e.property === 'contentArray');
        expect(arrayError).toBeDefined();
    });

    it("should fail validation when property is not an array", async () => {
        const model = new HTMLTestModel();
        model.singleContent = "<h1>Title</h1>";
        model.contentArray = "not an array" as any;
        
        const errors = await model.validate();
        expect(errors.length).toBeGreaterThan(0);
        
        const arrayError = errors.find(e => e.property === 'contentArray');
        expect(arrayError).toBeDefined();
        expect(arrayError?.constraints).toHaveProperty('isArray');
    });

    it("should handle empty arrays", async () => {
        const model = new HTMLTestModel();
        model.singleContent = "<h1>Title</h1>";
        model.contentArray = [];
        
        const errors = await model.validate();
        expect(errors).toHaveLength(0);
    });

    it("should handle optional arrays being undefined", async () => {
        const model = new HTMLTestModel();
        model.singleContent = "<h1>Title</h1>";
        model.contentArray = ["<p>Content</p>"];
        // optionalContentArray is undefined
        
        const errors = await model.validate();
        expect(errors).toHaveLength(0);
    });

    it("should serialize and deserialize arrays correctly", async () => {
        const model = new HTMLTestModel();
        model.singleContent = "<h1>Title</h1>";
        model.contentArray = ["<p>Content 1</p>", "<p>Content 2</p>"];
        model.optionalContentArray = ["<div>Optional</div>"];
        
        const json = model.toJSON();
        expect(json.contentArray).toEqual(["<p>Content 1</p>", "<p>Content 2</p>"]);
        expect(json.optionalContentArray).toEqual(["<div>Optional</div>"]);
        
        const restored = HTMLTestModel.fromJSON(json);
        expect(restored.contentArray).toEqual(["<p>Content 1</p>", "<p>Content 2</p>"]);
        expect(restored.optionalContentArray).toEqual(["<div>Optional</div>"]);
    });

    it("should convert non-string elements to strings during deserialization", async () => {
        const jsonData = {
            singleContent: "<h1>Title</h1>",
            contentArray: ["<p>String content</p>", 123, true], // Mixed types
            optionalContentArray: ["<div>Optional</div>"]
        };
        
        const restored = HTMLTestModel.fromJSON(jsonData);
        expect(restored.contentArray).toEqual(["<p>String content</p>", "123", "true"]);
        
        // Validation should pass after conversion
        const errors = await restored.validate();
        expect(errors).toHaveLength(0);
    });
});
