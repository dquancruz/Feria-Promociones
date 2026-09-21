import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiscountTag } from './DiscountTag';

describe('DiscountTag', () => {
  it('prints the percent sign next to both numbers', () => {
    render(<DiscountTag servicePct={5} productPct={3} />);

    const group = screen.getByRole('group', { name: 'Descuento de 5% en servicios y 3% en productos' });

    expect(group).toHaveTextContent('5%');
    expect(group).toHaveTextContent('3%');
  });

  it('shows 0% when there is no discount yet', () => {
    render(<DiscountTag servicePct={0} productPct={0} />);

    expect(screen.getByRole('group')).toHaveTextContent('0%–0%');
  });
});
