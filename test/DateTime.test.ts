import { Project } from "./model/Project";
import { DateTimeRangeType } from "@/model/types";

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

describe("DateTime Field Type", () => {
  describe("validation-tests", () => {
    it("should pass validation with valid dates within range", async () => {
      const project = new Project();
      project.name = "Date Test";
      project.startDate = new Date('2024-06-15'); // Within 2020-2030 range
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation when date is before minimum allowed", async () => {
      const project = new Project();
      project.name = "Date Test";
      project.startDate = new Date('2019-12-31'); // Before 2020-01-01 minimum
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });

    it("should fail validation when date is after maximum allowed", async () => {
      const project = new Project();
      project.name = "Date Test";
      project.startDate = new Date('2031-01-01'); // After 2030-12-31 maximum
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });

    it("should fail validation with invalid date", async () => {
      const project = new Project();
      project.name = "Invalid Date Test";
      project.startDate = new Date('invalid-date'); // Invalid date
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });

    it("should pass validation for endDate without constraints", async () => {
      const project = new Project();
      project.name = "End Date Test";
      project.startDate = new Date('2024-06-15');
      project.endDate = new Date('1990-01-01'); // No constraints on endDate
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("required-tests", () => {
    it("should fail validation when required DateTime field is missing", async () => {
      const project = new Project();
      project.name = "Date Test";
      // Missing startDate (required)
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      const summary = summarizeErrors(errors);
      
      expect(summary.some(error => error.field === "startDate")).toBe(true);
    });

    it("should pass validation when optional DateTime field is missing", async () => {
      const project = new Project();
      project.name = "Date Test";
      project.startDate = new Date('2024-06-15');
      // endDate is optional
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const errors = await project.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("JSON-conversion-tests", () => {
    it("should convert DateTime fields to ISO 8601 strings in JSON", () => {
      const project = new Project();
      project.name = "JSON Test Project";
      project.startDate = new Date('2024-06-15T10:00:00.000Z');
      project.endDate = new Date('2024-12-31T23:59:59.000Z');
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15T10:00:00.000Z');
      activeRange.to = new Date('2024-09-15T10:00:00.000Z');
      project.activeRange = activeRange;

      const json = project.toJSON();
      
      expect(json.startDate).toBe('2024-06-15T10:00:00.000Z');
      expect(json.endDate).toBe('2024-12-31T23:59:59.000Z');
    });

    it("should convert ISO 8601 strings back to Date objects from JSON", () => {
      const jsonData = {
        name: "Restored Project",
        startDate: '2024-06-15T10:00:00.000Z',
        endDate: '2024-12-31T23:59:59.000Z',
        activeRange: {
          from: '2024-06-15T10:00:00.000Z',
          to: '2024-09-15T10:00:00.000Z'
        }
      };

      const project = Project.fromJSON(jsonData);
      
      expect(project.startDate).toBeInstanceOf(Date);
      expect(project.endDate).toBeInstanceOf(Date);
      expect(project.startDate.toISOString()).toBe('2024-06-15T10:00:00.000Z');
      expect(project.endDate?.toISOString()).toBe('2024-12-31T23:59:59.000Z');
    });

    it("should handle undefined DateTime fields in JSON", () => {
      const project = new Project();
      project.name = "Test Project";
      project.startDate = new Date('2024-06-15');
      // endDate is undefined
      
      const activeRange = new DateTimeRangeType();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      project.activeRange = activeRange;

      const json = project.toJSON();
      expect(json).not.toHaveProperty("endDate");
    });
  });
});
