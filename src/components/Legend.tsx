import { COLORS, OPACITIES } from './constants';

export function Legend({ hasActiveThreshold }: { hasActiveThreshold: boolean }) {
    return <div className='text-xs h-8 grid grid-cols-4 grid-rows-1'>
        {hasActiveThreshold ?
            <>
                <div className='flex items-center gap-1'>
                    <div className='rounded-full size-4 shrink-0' style={{ backgroundColor: COLORS.pred, opacity: OPACITIES.matched }} />
                    <p>Matched Prediction</p>
                </div>
                <div className='flex items-center gap-1'>
                    <div className='rounded-full size-4 shrink-0' style={{ backgroundColor: COLORS.pred, opacity: OPACITIES.unmatched }} />
                    <p>Unmatched Prediction (FP)</p>
                </div>
                <div className='flex items-center gap-1'>
                    <div className='rounded-full size-4 shrink-0' style={{ backgroundColor: COLORS.ref, opacity: OPACITIES.matched }} />
                    <p>Matched Reference (TP)</p>
                </div>
                <div className='flex items-center gap-1'>
                    <div className='rounded-full size-4 shrink-0' style={{ backgroundColor: COLORS.ref, opacity: OPACITIES.unmatched }} />
                    <p>Unmatched Reference (FN)</p>
                </div>
            </>
            :
            <>
                <div className='flex gap-1 items-center'>
                    <div className='rounded-full size-4 shrink-0' style={{ backgroundColor: COLORS.pred, opacity: OPACITIES.default }} />
                    <p>Prediction</p>
                </div>
                <div className='flex gap-1 items-center'>
                    <div className='rounded-full size-4 shrink-0' style={{ backgroundColor: COLORS.ref, opacity: OPACITIES.default }} />
                    <p>Reference</p>
                </div>
            </>
        }
    </div>
}
