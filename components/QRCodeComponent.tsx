import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  value: string;
  size?: number;
}

export const QRCodeComponent: React.FC<Props> = ({ value, size = 128 }) => {
  return (
    <div className="bg-white p-2 border rounded-lg inline-block">
      <QRCodeSVG value={value} size={size} level="H" />
    </div>
  );
};