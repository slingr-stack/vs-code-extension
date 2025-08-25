import type { ValidationError } from "class-validator";
import { Project } from "./model/Project";
import { DateTimeRangeClass } from "../src/model/types/DateTime";

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

describe("Project Model DateTime Validation", () => {
  
  describe("Valid Project Creation", () => {
    it("should pass validation for a valid project with all required fields", async () => {
      const validProject = new Project();
      validProject.name = "Test Project";
      validProject.startDate = new Date('2024-06-15');
      validProject.endDate = new Date('2024-12-31');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeClass();
      flexibleRange.from = new Date('2024-01-01');
      flexibleRange.to = new Date('2024-12-31');
      validProject.flexibleRange = flexibleRange;
      
      validProject.description = "A test project";

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation with minimum required fields only", async () => {
      const validProject = new Project();
      validProject.name = "Minimal Project";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("Required Field Validation", () => {
    it("should fail validation when required fields are missing", async () => {
      const invalidProject = new Project();
      // Missing name, startDate, and activeRange

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      expect(summary.some(error => error.field === "name")).toBe(true);
      expect(summary.some(error => error.field === "startDate")).toBe(true);
      expect(summary.some(error => error.field === "activeRange")).toBe(true);
    });

    it("should pass validation when optional fields are missing", async () => {
      const validProject = new Project();
      validProject.name = "Optional Fields Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      // endDate, flexibleRange, and description are optional

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("DateTime Min/Max Validation", () => {
    it("should fail validation when startDate is before minimum allowed date", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Date Test";
      invalidProject.startDate = new Date('2019-12-31'); // Before 2020-01-01 minimum
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });

    it("should fail validation when startDate is after maximum allowed date", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Date Test";
      invalidProject.startDate = new Date('2031-01-01'); // After 2030-12-31 maximum
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });

    it("should pass validation with startDate within allowed range", async () => {
      const validProject = new Project();
      validProject.name = "Date Test";
      validProject.startDate = new Date('2024-06-15'); // Within 2020-2030 range
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for endDate without min/max constraints", async () => {
      const validProject = new Project();
      validProject.name = "End Date Test";
      validProject.startDate = new Date('2024-06-15');
      validProject.endDate = new Date('1990-01-01'); // No constraints on endDate
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("DateTimeRange Validation", () => {
    it("should fail validation when activeRange is missing both from and to dates", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Range Test";
      invalidProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      // Both from and to are undefined, but openStart and openEnd are false
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const rangeError = summary.find(error => error.field === "activeRange");
      expect(rangeError).toBeDefined();
      expect(rangeError?.codes).toContain("isValidDateTimeRange");
    });

    it("should fail validation when activeRange has from date after to date", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Range Test";
      invalidProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-09-15'); // After 'to' date
      activeRange.to = new Date('2024-06-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const rangeError = summary.find(error => error.field === "activeRange");
      expect(rangeError).toBeDefined();
      expect(rangeError?.codes).toContain("isValidDateTimeRange");
    });

    it("should pass validation for activeRange with valid from and to dates", async () => {
      const validProject = new Project();
      validProject.name = "Range Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for flexibleRange with only from date (openEnd=true)", async () => {
      const validProject = new Project();
      validProject.name = "Flexible Range Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeClass();
      flexibleRange.from = new Date('2024-01-01');
      // to is undefined, but openEnd is true
      validProject.flexibleRange = flexibleRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for flexibleRange with only to date (openStart=true)", async () => {
      const validProject = new Project();
      validProject.name = "Flexible Range Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeClass();
      // from is undefined, but openStart is true
      flexibleRange.to = new Date('2024-12-31');
      validProject.flexibleRange = flexibleRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for flexibleRange with neither date (both open)", async () => {
      const validProject = new Project();
      validProject.name = "Flexible Range Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeClass();
      // Both from and to are undefined, but both openStart and openEnd are true
      validProject.flexibleRange = flexibleRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("Invalid Date Validation", () => {
    it("should fail validation with invalid date string", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Invalid Date Test";
      invalidProject.startDate = new Date('invalid-date'); // Invalid date
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });
  });

  describe("Text Field Validation", () => {
    it("should fail validation when name is too short", async () => {
      const invalidProject = new Project();
      invalidProject.name = "A"; // Too short (minLength is 2)
      invalidProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const nameError = summary.find(error => error.field === "name");
      expect(nameError).toBeDefined();
      expect(nameError?.codes).toContain("minLength");
    });

    it("should fail validation when name is too long", async () => {
      const invalidProject = new Project();
      invalidProject.name = "A".repeat(101); // Too long (maxLength is 100)
      invalidProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const nameError = summary.find(error => error.field === "name");
      expect(nameError).toBeDefined();
      expect(nameError?.codes).toContain("maxLength");
    });

    it("should fail validation when description is too long", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Description Test";
      invalidProject.startDate = new Date('2024-06-15');
      invalidProject.description = "A".repeat(501); // Too long (maxLength is 500)
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const descError = summary.find(error => error.field === "description");
      expect(descError).toBeDefined();
      expect(descError?.codes).toContain("maxLength");
    });
  });

  describe("JSON Conversion", () => {
    describe("toJSON", () => {
      it("should convert DateTime fields to ISO 8601 strings", async () => {
        const project = new Project();
        project.name = "JSON Test Project";
        project.startDate = new Date('2024-06-15T10:30:45.123Z');
        project.endDate = new Date('2024-12-31T23:59:59.999Z');
        
        const activeRange = new DateTimeRangeClass();
        activeRange.from = new Date('2024-06-15T08:00:00.000Z');
        activeRange.to = new Date('2024-09-15T17:00:00.000Z');
        project.activeRange = activeRange;
        
        const json = project.toJSON();
        
        expect(json.name).toBe("JSON Test Project");
        expect(json.startDate).toBe("2024-06-15T10:30:45.123Z");
        expect(json.endDate).toBe("2024-12-31T23:59:59.999Z");
        expect(json.activeRange).toEqual({
          from: "2024-06-15T08:00:00.000Z",
          to: "2024-09-15T17:00:00.000Z"
        });
      });

      it("should handle undefined optional fields in JSON output", async () => {
        const project = new Project();
        project.name = "Minimal JSON Project";
        project.startDate = new Date('2024-06-15T10:30:45.123Z');
        
        const activeRange = new DateTimeRangeClass();
        activeRange.from = new Date('2024-06-15T08:00:00.000Z');
        activeRange.to = new Date('2024-09-15T17:00:00.000Z');
        project.activeRange = activeRange;
        
        const json = project.toJSON();
        
        expect(json.name).toBe("Minimal JSON Project");
        expect(json.startDate).toBe("2024-06-15T10:30:45.123Z");
        expect(json.endDate).toBeUndefined();
        expect(json.flexibleRange).toBeUndefined();
        expect(json.activeRange).toEqual({
          from: "2024-06-15T08:00:00.000Z",
          to: "2024-09-15T17:00:00.000Z"
        });
      });

      it("should handle DateTimeRange with partial dates", async () => {
        const project = new Project();
        project.name = "Partial Range Project";
        project.startDate = new Date('2024-06-15T10:30:45.123Z');
        
        const activeRange = new DateTimeRangeClass();
        activeRange.from = new Date('2024-06-15T08:00:00.000Z');
        activeRange.to = new Date('2024-09-15T17:00:00.000Z');
        project.activeRange = activeRange;
        
        const flexibleRange = new DateTimeRangeClass();
        flexibleRange.from = new Date('2024-01-01T00:00:00.000Z');
        // to is undefined (open end)
        project.flexibleRange = flexibleRange;
        
        const json = project.toJSON();
        
        expect(json.flexibleRange).toEqual({
          from: "2024-01-01T00:00:00.000Z",
          to: undefined
        });
      });
    });

    describe("fromJSON", () => {
      it("should convert ISO 8601 strings back to Date objects", async () => {
        const jsonData = {
          name: "Restored Project",
          startDate: "2024-06-15T10:30:45.123Z",
          endDate: "2024-12-31T23:59:59.999Z",
          activeRange: {
            from: "2024-06-15T08:00:00.000Z",
            to: "2024-09-15T17:00:00.000Z"
          },
          flexibleRange: {
            from: "2024-01-01T00:00:00.000Z",
            to: "2024-12-31T23:59:59.999Z"
          }
        };
        
        const project = Project.fromJSON(jsonData);
        
        expect(project.name).toBe("Restored Project");
        expect(project.startDate).toBeInstanceOf(Date);
        expect(project.startDate.toISOString()).toBe("2024-06-15T10:30:45.123Z");
        expect(project.endDate).toBeInstanceOf(Date);
        expect(project.endDate!.toISOString()).toBe("2024-12-31T23:59:59.999Z");
        
        expect(project.activeRange).toBeInstanceOf(DateTimeRangeClass);
        expect(project.activeRange.from).toBeInstanceOf(Date);
        expect(project.activeRange.from!.toISOString()).toBe("2024-06-15T08:00:00.000Z");
        expect(project.activeRange.to).toBeInstanceOf(Date);
        expect(project.activeRange.to!.toISOString()).toBe("2024-09-15T17:00:00.000Z");
        
        expect(project.flexibleRange).toBeInstanceOf(DateTimeRangeClass);
        expect(project.flexibleRange!.from).toBeInstanceOf(Date);
        expect(project.flexibleRange!.from!.toISOString()).toBe("2024-01-01T00:00:00.000Z");
        expect(project.flexibleRange!.to).toBeInstanceOf(Date);
        expect(project.flexibleRange!.to!.toISOString()).toBe("2024-12-31T23:59:59.999Z");
      });

      it("should support milliseconds for backwards compatibility", async () => {
        const jsonData = {
          name: "Legacy Project",
          startDate: 1718448645123, // milliseconds
          endDate: 1735689599999,   // milliseconds
          activeRange: {
            from: 1718434800000,    // milliseconds
            to: 1726423200000       // milliseconds
          }
        };
        
        const project = Project.fromJSON(jsonData);
        
        expect(project.startDate).toBeInstanceOf(Date);
        expect(project.startDate.getTime()).toBe(1718448645123);
        expect(project.endDate).toBeInstanceOf(Date);
        expect(project.endDate!.getTime()).toBe(1735689599999);
        
        expect(project.activeRange.from).toBeInstanceOf(Date);
        expect(project.activeRange.from!.getTime()).toBe(1718434800000);
        expect(project.activeRange.to).toBeInstanceOf(Date);
        expect(project.activeRange.to!.getTime()).toBe(1726423200000);
      });

      it("should handle mixed ISO 8601 and milliseconds", async () => {
        const jsonData = {
          name: "Mixed Format Project",
          startDate: "2024-06-15T10:30:45.123Z", // ISO 8601
          endDate: 1735689599999,                 // milliseconds
          activeRange: {
            from: 1718434800000,                  // milliseconds
            to: "2024-09-15T17:00:00.000Z"        // ISO 8601
          }
        };
        
        const project = Project.fromJSON(jsonData);
        
        expect(project.startDate).toBeInstanceOf(Date);
        expect(project.startDate.toISOString()).toBe("2024-06-15T10:30:45.123Z");
        expect(project.endDate).toBeInstanceOf(Date);
        expect(project.endDate!.getTime()).toBe(1735689599999);
        
        expect(project.activeRange.from).toBeInstanceOf(Date);
        expect(project.activeRange.from!.getTime()).toBe(1718434800000);
        expect(project.activeRange.to).toBeInstanceOf(Date);
        expect(project.activeRange.to!.toISOString()).toBe("2024-09-15T17:00:00.000Z");
      });

      it("should handle undefined fields in JSON input", async () => {
        const jsonData = {
          name: "Minimal JSON Input",
          startDate: "2024-06-15T10:30:45.123Z",
          activeRange: {
            from: "2024-06-15T08:00:00.000Z",
            to: "2024-09-15T17:00:00.000Z"
          }
          // endDate and flexibleRange are undefined
        };
        
        const project = Project.fromJSON(jsonData);
        
        expect(project.name).toBe("Minimal JSON Input");
        expect(project.startDate).toBeInstanceOf(Date);
        expect(project.endDate).toBeUndefined();
        expect(project.flexibleRange).toBeUndefined();
        expect(project.activeRange).toBeInstanceOf(DateTimeRangeClass);
      });

      it("should handle partial DateTimeRange in JSON input", async () => {
        const jsonData = {
          name: "Partial Range JSON",
          startDate: "2024-06-15T10:30:45.123Z",
          activeRange: {
            from: "2024-06-15T08:00:00.000Z",
            to: "2024-09-15T17:00:00.000Z"
          },
          flexibleRange: {
            from: "2024-01-01T00:00:00.000Z"
            // to is undefined (open end)
          }
        };
        
        const project = Project.fromJSON(jsonData);
        
        expect(project.flexibleRange).toBeInstanceOf(DateTimeRangeClass);
        expect(project.flexibleRange!.from).toBeInstanceOf(Date);
        expect(project.flexibleRange!.from!.toISOString()).toBe("2024-01-01T00:00:00.000Z");
        expect(project.flexibleRange!.to).toBeUndefined();
      });
    });

    describe("Round-trip conversion", () => {
      it("should maintain data integrity through toJSON/fromJSON cycle", async () => {
        const originalProject = new Project();
        originalProject.name = "Round-trip Project";
        originalProject.startDate = new Date('2024-06-15T10:30:45.123Z');
        originalProject.endDate = new Date('2024-12-31T23:59:59.999Z');
        originalProject.description = "Test description";
        
        const activeRange = new DateTimeRangeClass();
        activeRange.from = new Date('2024-06-15T08:00:00.000Z');
        activeRange.to = new Date('2024-09-15T17:00:00.000Z');
        originalProject.activeRange = activeRange;
        
        const flexibleRange = new DateTimeRangeClass();
        flexibleRange.from = new Date('2024-01-01T00:00:00.000Z');
        flexibleRange.to = new Date('2024-12-31T23:59:59.999Z');
        originalProject.flexibleRange = flexibleRange;
        
        // Convert to JSON and back
        const json = originalProject.toJSON();
        const restoredProject = Project.fromJSON(json);
        
        // Verify all fields match
        expect(restoredProject.name).toBe(originalProject.name);
        expect(restoredProject.startDate.getTime()).toBe(originalProject.startDate.getTime());
        expect(restoredProject.endDate!.getTime()).toBe(originalProject.endDate!.getTime());
        expect(restoredProject.description).toBe(originalProject.description);
        
        expect(restoredProject.activeRange.from!.getTime()).toBe(originalProject.activeRange.from!.getTime());
        expect(restoredProject.activeRange.to!.getTime()).toBe(originalProject.activeRange.to!.getTime());
        
        expect(restoredProject.flexibleRange!.from!.getTime()).toBe(originalProject.flexibleRange!.from!.getTime());
        expect(restoredProject.flexibleRange!.to!.getTime()).toBe(originalProject.flexibleRange!.to!.getTime());
        
        // Verify the restored object can still be validated
        const errors = await restoredProject.validate();
        expect(errors).toStrictEqual([]);
      });

      it("should produce consistent JSON format as specified", async () => {
        const project = new Project();
        project.name = "Hotel Reservation System";
        project.startDate = new Date('2025-08-21T13:42:24.123Z');
        
        const activeRange = new DateTimeRangeClass();
        activeRange.from = new Date('2025-08-21T13:42:24.123Z');
        activeRange.to = new Date('2025-08-23T13:42:24.123Z');
        project.activeRange = activeRange;
        
        const json = project.toJSON();
        
        // Verify the JSON structure matches the specification
        expect(json).toEqual({
          name: "Hotel Reservation System",
          startDate: "2025-08-21T13:42:24.123Z",
          activeRange: {
            from: "2025-08-21T13:42:24.123Z",
            to: "2025-08-23T13:42:24.123Z"
          }
        });
      });
    });
  });
});
