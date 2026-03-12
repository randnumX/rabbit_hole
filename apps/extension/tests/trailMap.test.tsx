import { fireEvent, render, screen } from '@testing-library/react';
import type { AnalysisResponse } from '@rabbithole/shared-types';
import sampleAnalysis from '../../../examples/conversations/chatgpt-sample-analysis.json';
import { TrailMap } from '@/sidebar/components/TrailMap';

describe('TrailMap', () => {
  it('clicks a trail node and triggers selection plus transcript jump', () => {
    const onSelectTurn = vi.fn();
    const onJumpToTurn = vi.fn();

    render(
      <TrailMap
        analysis={sampleAnalysis as AnalysisResponse}
        selectedTurn={(sampleAnalysis as AnalysisResponse).turns[8]}
        selectedTurnId={9}
        rabbitState="ON_PATH"
        onSelectTurn={onSelectTurn}
        onJumpToTurn={onJumpToTurn}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trail node 7' }));

    expect(onSelectTurn).toHaveBeenCalledWith(7);
    expect(onJumpToTurn).toHaveBeenCalledWith(7);
  });

  it('keeps node activation working when pointer events fire before click', () => {
    const onSelectTurn = vi.fn();
    const onJumpToTurn = vi.fn();

    render(
      <TrailMap
        analysis={sampleAnalysis as AnalysisResponse}
        selectedTurn={(sampleAnalysis as AnalysisResponse).turns[8]}
        selectedTurnId={9}
        rabbitState="ON_PATH"
        onSelectTurn={onSelectTurn}
        onJumpToTurn={onJumpToTurn}
      />,
    );

    const node = screen.getByRole('button', { name: 'Trail node 7' });
    fireEvent.pointerDown(node);
    fireEvent.pointerUp(node);
    fireEvent.click(node);

    expect(onSelectTurn).toHaveBeenCalledWith(7);
    expect(onJumpToTurn).toHaveBeenCalledWith(7);
  });

  it('renders explicit trail copy for exchange nodes and transcript jumping', () => {
    render(
      <TrailMap
        analysis={sampleAnalysis as AnalysisResponse}
        selectedTurn={(sampleAnalysis as AnalysisResponse).turns[8]}
        selectedTurnId={9}
        rabbitState="ON_PATH"
        onSelectTurn={() => {}}
        onJumpToTurn={() => {}}
      />,
    );

    expect(screen.getByText(/exchange nodes/i)).toBeTruthy();
    expect(screen.getByText(/click to jump/i)).toBeTruthy();
  });

  it('keeps the trail HUD collapsed until the toggle button is pressed', () => {
    render(
      <TrailMap
        analysis={sampleAnalysis as AnalysisResponse}
        selectedTurn={(sampleAnalysis as AnalysisResponse).turns[8]}
        selectedTurnId={9}
        rabbitState="ON_PATH"
        onSelectTurn={() => {}}
        onJumpToTurn={() => {}}
      />,
    );

    expect(screen.queryByText('Trail HUD')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /show trail hud/i }));
    expect(screen.getByText('Trail HUD')).toBeTruthy();
  });

  it('supports zoom controls with reset back to the default scale', () => {
    render(
      <TrailMap
        analysis={sampleAnalysis as AnalysisResponse}
        selectedTurn={(sampleAnalysis as AnalysisResponse).turns[8]}
        selectedTurnId={9}
        rabbitState="ON_PATH"
        onSelectTurn={() => {}}
        onJumpToTurn={() => {}}
      />,
    );

    const resetButton = screen.getByRole('button', { name: /reset trail zoom/i });
    expect(resetButton.textContent).toContain('100%');

    fireEvent.click(screen.getByRole('button', { name: /zoom in trail/i }));
    expect(resetButton.textContent).toContain('115%');

    fireEvent.click(screen.getByRole('button', { name: /reset trail zoom/i }));
    expect(resetButton.textContent).toContain('100%');
  });
});
