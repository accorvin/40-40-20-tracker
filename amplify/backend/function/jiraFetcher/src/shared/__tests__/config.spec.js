// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  getStoragePrefix,
  prefixKey,
  getHistoryKey,
  createPrefixedStorage
} from '../config.js';

describe('getStoragePrefix', () => {
  it('returns data/{projectKey}/ prefix', () => {
    expect(getStoragePrefix('RHOAIENG')).toBe('data/RHOAIENG/');
  });

  it('works with different project keys', () => {
    expect(getStoragePrefix('RHAISTRAT')).toBe('data/RHAISTRAT/');
  });
});

describe('prefixKey', () => {
  it('prepends project namespace to key', () => {
    expect(prefixKey('RHOAIENG', 'boards.json')).toBe('data/RHOAIENG/boards.json');
  });

  it('handles nested keys', () => {
    expect(prefixKey('RHOAIENG', 'sprints/123.json')).toBe('data/RHOAIENG/sprints/123.json');
  });
});

describe('getHistoryKey', () => {
  it('returns history path with project, board, and sprint', () => {
    expect(getHistoryKey('RHOAIENG', 42, 100)).toBe('data/history/RHOAIENG/42/100.json');
  });
});

describe('createPrefixedStorage', () => {
  it('prefixes keys on read', async () => {
    const readStorage = vi.fn().mockReturnValue({ some: 'data' });
    const writeStorage = vi.fn();

    const { read, write } = createPrefixedStorage('data/RHOAIENG/', readStorage, writeStorage);

    const result = await read('boards.json');

    expect(readStorage).toHaveBeenCalledWith('data/RHOAIENG/boards.json');
    expect(result).toEqual({ some: 'data' });
  });

  it('prefixes keys on write', async () => {
    const readStorage = vi.fn();
    const writeStorage = vi.fn();

    const { read, write } = createPrefixedStorage('data/RHOAIENG/', readStorage, writeStorage);

    await write('teams.json', { teams: [] });

    expect(writeStorage).toHaveBeenCalledWith('data/RHOAIENG/teams.json', { teams: [] });
  });

  it('handles nested keys', async () => {
    const readStorage = vi.fn().mockReturnValue(null);
    const writeStorage = vi.fn();

    const { read, write } = createPrefixedStorage('data/RHOAIENG/', readStorage, writeStorage);

    await read('sprints/100.json');
    expect(readStorage).toHaveBeenCalledWith('data/RHOAIENG/sprints/100.json');

    await write('sprints/100.json', { issues: [] });
    expect(writeStorage).toHaveBeenCalledWith('data/RHOAIENG/sprints/100.json', { issues: [] });
  });

  it('works with async storage functions', async () => {
    const readStorage = vi.fn().mockResolvedValue({ boards: [] });
    const writeStorage = vi.fn().mockResolvedValue(undefined);

    const { read, write } = createPrefixedStorage('data/RHOAIENG/', readStorage, writeStorage);

    const result = await read('boards.json');
    expect(result).toEqual({ boards: [] });

    await write('boards.json', { boards: [1] });
    expect(writeStorage).toHaveBeenCalledWith('data/RHOAIENG/boards.json', { boards: [1] });
  });
});
