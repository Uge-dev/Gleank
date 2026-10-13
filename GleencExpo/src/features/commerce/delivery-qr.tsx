import { useMemo } from 'react';
import { View } from 'react-native';
import { create } from './vendor/qr-core';

export function DeliveryQR({ code }: { code: string }) {
  const matrix = useMemo(() => create([{ data: code, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' }).modules, [code]);
  const cell = Math.max(3, Math.floor(230 / (matrix.size + 8)));
  const size = (matrix.size + 8) * cell;
  const bars: { row: number; col: number; length: number }[] = [];
  for (let row = 0; row < matrix.size; row++) {
    let col = 0;
    while (col < matrix.size) {
      if (!matrix.data[row * matrix.size + col]) { col++; continue; }
      const start = col;
      while (col < matrix.size && matrix.data[row * matrix.size + col]) col++;
      bars.push({ row, col: start, length: col - start });
    }
  }
  return <View accessible accessibilityLabel="Unique delivery QR code" style={{ width: size, height: size, backgroundColor: '#fff', alignSelf: 'center' }}>{bars.map((bar, index) => <View key={index} style={{ position: 'absolute', top: (bar.row + 4) * cell, left: (bar.col + 4) * cell, width: bar.length * cell, height: cell, backgroundColor: '#000' }} />)}</View>;
}
