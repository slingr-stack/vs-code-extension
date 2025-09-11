import { Project } from "../model/Project";
import { DateTimeRangeValue } from "../../index";

import type { ValidationError } from "class-validator";

/**
 * Converts an array of class-validator ValidationError objects into a stable, plain summary.
 *
 * @param {ValidationError[]} errors - Array of ValidationError objects from class-validator.
 * @returns {Array<{field: string, codes: string[], messages: string[]}>} An array of summary objects with field, codes, and messages.
 */
function summarizeErrors(errors: ValidationError[]) {
  return errors.map((e) => ({
    field: e.property,
    codes: e.constraints ? Object.keys(e.constraints) : [],
    messages: e.constraints ? Object.values(e.constraints) : [],
  }));
}

describe("DateTimeRange Field Type", () => {
  describe("validation-tests", () => {
    it("should pass validation with valid DateTimeRange", async () => {
      const project = new Project();
      project.name = "Range Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation when range has from date after to date", async () => {
      const project = new Project();
      project.name = "Range Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      activeRange.from = new Date('2024-09-15'); // After 'to' date
      activeRange.to = new Date('2024-06-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      const summary = summarizeErrors(errors);
      
      const rangeError = summary.find(error => error.field === "activeRange");
      expect(rangeError).toBeDefined();
      expect(rangeError?.codes).toContain("isValidDateTimeRange");
    });

    it("should fail validation when range is missing both dates (closed range)", async () => {
      const project = new Project();
      project.name = "Range Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      // Both from and to are undefined, but openStart and openEnd are false
      project.activeRange = activeRange;

      const errors = await project.validate();
      const summary = summarizeErrors(errors);
      
      const rangeError = summary.find(error => error.field === "activeRange");
      expect(rangeError).toBeDefined();
      expect(rangeError?.codes).toContain("isValidDateTimeRange");
    });

    it("should pass validation for flexible range with only from date (openEnd=true)", async () => {
      const project = new Project();
      project.name = "Flexible Range Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeValue();
      flexibleRange.from = new Date('2024-01-01');
      // to is undefined, but openEnd is true
      project.flexibleRange = flexibleRange;

      const errors = await project.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for flexible range with only to date (openStart=true)", async () => {
      const project = new Project();
      project.name = "Flexible Range Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeValue();
      // from is undefined, but openStart is true
      flexibleRange.to = new Date('2024-12-31');
      project.flexibleRange = flexibleRange;

      const errors = await project.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for flexible range with neither date (both open)", async () => {
      const project = new Project();
      project.name = "Flexible Range Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeValue();
      // Both from and to are undefined, but both openStart and openEnd are true
      project.flexibleRange = flexibleRange;

      const errors = await project.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("required-tests", () => {
    it("should fail validation when required DateTimeRange is missing", async () => {
      const project = new Project();
      project.name = "Range Test";
      project.startDate = new Date('2024-06-15');
      // Missing activeRange (required)

      const errors = await project.validate();
      const summary = summarizeErrors(errors);
      
      expect(summary.some(error => error.field === "activeRange")).toBe(true);
    });

    it("should pass validation when optional DateTimeRange is missing", async () => {
      const project = new Project();
      project.name = "Range Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;
      // flexibleRange is optional

      const errors = await project.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("JSON-conversion-tests", () => {
    it("should convert DateTimeRange to nested object with ISO strings", () => {
      const project = new Project();
      project.name = "Range JSON Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      activeRange.from = new Date('2024-06-15T10:00:00.000Z');
      activeRange.to = new Date('2024-09-15T10:00:00.000Z');
      project.activeRange = activeRange;

      const json = project.toJSON();
      
      expect(json.activeRange).toEqual({
        from: '2024-06-15T10:00:00.000Z',
        to: '2024-09-15T10:00:00.000Z'
      });
    });

    it("should convert nested object back to DateTimeRange from JSON", () => {
      const jsonData = {
        name: "Range JSON Test",
        startDate: '2024-06-15T10:00:00.000Z',
        activeRange: {
          from: '2024-06-15T10:00:00.000Z',
          to: '2024-09-15T10:00:00.000Z'
        }
      };

      const project = Project.fromJSON(jsonData);
      
      expect(project.activeRange).toBeInstanceOf(DateTimeRangeValue);
      expect(project.activeRange.from).toBeInstanceOf(Date);
      expect(project.activeRange.to).toBeInstanceOf(Date);
      expect(project.activeRange.from?.toISOString()).toBe('2024-06-15T10:00:00.000Z');
      expect(project.activeRange.to?.toISOString()).toBe('2024-09-15T10:00:00.000Z');
    });

    it("should handle partial DateTimeRange in JSON", () => {
      const project = new Project();
      project.name = "Partial Range Test";
      project.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeValue();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeValue();
      flexibleRange.from = new Date('2024-01-01');
      // to is undefined
      project.flexibleRange = flexibleRange;

      const json = project.toJSON();
      
      // The flexibleRange should have a from property and may or may not have a to property
      expect(json.flexibleRange).toHaveProperty("from");
      expect(typeof json.flexibleRange.from).toBe("string");
      
      // If to is included, it should be undefined/null, but the property may still exist
      if (Object.hasOwnProperty.call(json.flexibleRange, "to")) {
        expect(json.flexibleRange.to).toBeUndefined();
      }
    });
  });
});
