import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock db.ts isTauri
vi.mock('./db', () => ({
  isTauri: vi.fn(() => false),
}));

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

import { printPage } from './print';
import { isTauri } from './db';
import { invoke } from '@tauri-apps/api/core';

const mockedIsTauri = vi.mocked(isTauri);
const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('printPage', () => {
  it('browser path calls window.print()', async () => {
    mockedIsTauri.mockReturnValue(false);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    await printPage();
    expect(printSpy).toHaveBeenCalledOnce();
    expect(mockedInvoke).not.toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('Tauri path invokes print_page command', async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(undefined as never);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    await printPage();
    expect(mockedInvoke).toHaveBeenCalledWith('print_page');
    expect(printSpy).not.toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('Tauri path rejects when invoke fails', async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockRejectedValue(new Error('no printer'));
    await expect(printPage()).rejects.toThrow('no printer');
  });
});
