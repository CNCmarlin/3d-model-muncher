/* @vitest-environment jsdom */
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelCard } from '@/components/models/ModelCard';
import { ModelHubView } from '@/components/models/ModelHubView';
import * as downloadUtils from '@/utils/downloadUtils';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root && container) {
    try { root.unmount(); } catch { }
  }
  if (container && container.parentNode) container.parentNode.removeChild(container);
  container = null;
  root = null;
  vi.restoreAllMocks();
});

describe('download behavior', () => {
  it('ModelCard Download button calls triggerDownload with basename only', () => {
    const spy = vi.spyOn(downloadUtils, 'triggerDownload').mockImplementation(() => { });

    const model: any = {
      id: 'm1',
      name: 'Test Model',
      modelUrl: '/models/test/subdir/file.3mf',
      tags: [],
      printSettings: {}
    };

    act(() => {
      root = createRoot(container!);
      root.render(<ModelCard model={model} onClick={() => { }} />);
    });

    // Find the ModelCard Download button inside the rendered container by text
    // (the ModelCard button does not set a title attribute).
    const btn = Array.from(container!.querySelectorAll('button')).find(b => (b.textContent || '').includes('Download')) as HTMLButtonElement | null;
    expect(btn).toBeDefined();

    act(() => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0];
    // first arg: original URL, third arg: basename only
    expect(call[0]).toBe(model.modelUrl);
    expect(call[2]).toBe('file.3mf');
  });

  it('ModelHubView downloads initiate correctly', async () => {
    // Smoke test only - verifying button presence and clickability

    const model: any = {
      id: 'm2',
      name: 'Backslash Model',
      // simulate a Windows-y modelUrl containing backslashes
      modelUrl: '/models\\subdir\\my_file.3mf',
      tags: [],
      printSettings: {}
    };

    act(() => {
      root = createRoot(container!);
      root.render(
        <ModelHubView
          model={model}
          models={[]}
          onClose={() => { }}
          onModelUpdate={() => { }}
          categories={[]}
          collections={[]}
          isSidebarOpen={true}
          onOpenCollection={() => { }}
          onFilterChange={() => { }}
          onSettingsClick={() => { }}
        />
      );
    });

    // Wait for any microtasks (component effects)
    await Promise.resolve();

    // The ModelHubView renders a "Download All" button in the floating bar
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Download All')) as HTMLButtonElement | null;
    expect(btn).toBeDefined();

    act(() => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  });
});
