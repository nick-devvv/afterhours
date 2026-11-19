// The live shift: the "night shift" artboard from the design canvas, wired to the Afterhours API,
// plus the real text thread with Rosa. The run id comes from ?run=<id> (set by the home page).
import type { Metadata } from 'next';
import { ShopArtboard } from '../_ui/ShopArtboard';
import { PhoneMirror } from '../_ui/PhoneMirror';
import { design } from '../_ui/design';

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Afterhours · the night shift' };

export default function ShopPage() {
  return (
    <>
      <ShopArtboard source={design('Shop')} live />
      <PhoneMirror />
    </>
  );
}
