'use client';

import { Button } from '@/components/ui';
import { Clipboard, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export function AiStaffCopyButton({ label, text }: { label: string; text: string }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
    }

    return (
        <Button type="button" variant="secondary" onClick={() => void handleCopy()} className="min-h-9 px-3 py-1.5">
            {copied ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clipboard className="mr-2 h-4 w-4" />}
            {copied ? '복사 완료' : label}
        </Button>
    );
}
