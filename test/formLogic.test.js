import { describe, it, expect } from 'vitest';
import { formLogicFn } from '../src/components/formLogic.js';

describe('formLogic toString fix', () => {
  it('includes parseSurgeConfigInput definition in toString output', () => {
    const fnString = formLogicFn.toString();

    // Verify the function references parseSurgeConfigInput
    expect(fnString).toContain('parseSurgeConfigInput');

    // Verify the arrow function definitions ARE included
    expect(fnString).toMatch(/(?:const|var|let)\s+parseSurgeConfigInput\s*=/);
    expect(fnString).toMatch(/(?:const|var|let)\s+parseSurgeValue\s*=/);
    expect(fnString).toMatch(/(?:const|var|let)\s+convertSurgeIniToJson\s*=/);
  });

  it('does not contain __name calls that break in browser runtime', () => {
    const fnString = formLogicFn.toString();
    // Ensure no function declarations that esbuild would inject __name() for
    expect(fnString).not.toMatch(/^\s*function\s+parseSurgeValue\b/m);
    expect(fnString).not.toMatch(/^\s*function\s+convertSurgeIniToJson\b/m);
    expect(fnString).not.toMatch(/^\s*function\s+parseSurgeConfigInput\b/m);
  });

  it('formData() returns a valid Alpine data object', () => {
    // Simulate browser global environment using Function constructor
    const fakeWindow = { APP_TRANSLATIONS: {}, PREDEFINED_RULE_SETS: {} };
    const fn = new Function('window', '(' + formLogicFn.toString() + ')(); return window;');
    const result = fn(fakeWindow);
    const data = result.formData();
    expect(typeof data.submitForm).toBe('function');
    expect(typeof data.toggleAccordion).toBe('function');
    expect(data.showAdvanced).toBe(false);
  });

  it('persists country sorting and restores it from generated links', async () => {
    const storage = new Map([['sortByCountry', 'true']]);
    const watchers = {};
    const fakeWindow = { location: { origin: 'http://localhost', search: '' }, PREDEFINED_RULE_SETS: {} };
    const fakeStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, String(value)) };
    const fn = new Function('window', 'document', 'localStorage', '(' + formLogicFn.toString() + ')(); return window.formData();');
    const data = fn(fakeWindow, { querySelector: () => null }, fakeStorage);
    expect(data.sortByCountry).toBe(false);
    data.$watch = (key, callback) => { watchers[key] = callback; };
    data.init();
    expect(data.sortByCountry).toBe(true);
    watchers.sortByCountry(false);
    expect(storage.get('sortByCountry')).toBe('false');
    data.input = 'ss://example.com:443#HK';
    await data.submitForm();
    for (const link of Object.values(data.generatedLinks)) {
      expect(new URL(link).searchParams.get('sort_by_country')).toBe('true');
    }
    data.sortByCountry = false;
    data.populateFormFromUrl(new URL(data.generatedLinks.clash));
    expect(data.sortByCountry).toBe(true);
    expect(data.showAdvanced).toBe(true);
    data.populateFormFromUrl(new URL('http://localhost/clash?config=test'));
    expect(data.sortByCountry).toBe(false);
    await data.submitForm();
    expect(new URL(data.generatedLinks.clash).searchParams.has('sort_by_country')).toBe(false);
  });
});
