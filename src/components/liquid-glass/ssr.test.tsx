import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Glass, GlassProvider, Ink } from './index';

// Runs in Node with no window, document or CSS: the same conditions as a server render.
describe('server rendering', () => {
  it('renders without a provider', () => {
    const html = renderToString(
      <Glass radius={24}>
        <Ink>Title</Ink>
      </Glass>,
    );
    expect(html).toContain('class="lg"');
    expect(html).toContain('data-state="light"');
    expect(html).toContain('Title');
  });

  it('renders inside a provider, in dark mode, with a render function', () => {
    const html = renderToString(
      <GlassProvider theme="dark" options={{ contrast: 7 }}>
        <Glass>{(g) => <Ink tone={2}>{g.state}</Ink>}</Glass>
      </GlassProvider>,
    );
    expect(html).toContain('data-state="dark"');
    // No lens markup on the server: it is decided after mount, so hydration matches.
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('<filter');
  });
});
