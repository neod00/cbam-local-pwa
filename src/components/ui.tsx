import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'pending';

const badgeToneClass: Record<StatusTone, string> = {
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    info: 'bg-blue-50 text-blue-800 ring-blue-600/20',
    warning: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    danger: 'bg-red-50 text-red-800 ring-red-600/20',
    neutral: 'bg-slate-50 text-slate-700 ring-slate-600/20',
    pending: 'bg-teal-50 text-teal-800 ring-teal-600/20',
};

const buttonVariantClass = {
    primary: 'bg-teal-700 text-white hover:bg-teal-600 active:bg-teal-800 disabled:bg-slate-300',
    secondary: 'border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
    danger: 'border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50 disabled:text-red-300',
};

export function PageHeader({
    title,
    description,
    eyebrow,
    actions,
}: {
    title: string;
    description?: string;
    eyebrow?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-5 pb-1 pt-1 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
                {eyebrow && <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700">{eyebrow}</p>}
                <h1 className="mt-2 break-words text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.02em] text-slate-950 sm:text-[2.1rem]">{title}</h1>
                {description && <p className="mt-3 max-w-2xl break-words text-[15px] leading-7 text-slate-600">{description}</p>}
            </div>
            {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function SectionCard({
    id,
    title,
    description,
    children,
    className,
    actions,
}: {
    id?: string;
    title?: string;
    description?: string;
    children: ReactNode;
    className?: string;
    actions?: ReactNode;
}) {
    return (
        <section id={id} className={clsx('w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]', className)}>
            {(title || description || actions) && (
                <div className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        {title && <h2 className="break-words text-base font-semibold text-slate-950">{title}</h2>}
                        {description && <p className="mt-1 break-words text-sm leading-6 text-slate-600">{description}</p>}
                    </div>
                    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

export function StatCard({
    label,
    value,
    helper,
    icon: Icon,
    tone = 'info',
}: {
    label: string;
    value: ReactNode;
    helper?: string;
    icon?: LucideIcon;
    tone?: StatusTone;
}) {
    const iconClass: Record<StatusTone, string> = {
        success: 'bg-emerald-50 text-emerald-700',
        info: 'bg-blue-50 text-blue-700',
        warning: 'bg-amber-50 text-amber-700',
        danger: 'bg-red-50 text-red-700',
        neutral: 'bg-slate-50 text-slate-700',
        pending: 'bg-teal-50 text-teal-700',
    };

    return (
        <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]">
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-slate-500">{label}</p>
                    <div className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
                </div>
                {Icon && (
                    <div className={clsx('flex-none rounded-xl p-2.5 ring-1 ring-inset ring-black/5', iconClass[tone])}>
                        <Icon className="h-5 w-5" />
                    </div>
                )}
            </div>
            {helper && <p className="mt-3 break-words text-sm text-slate-500">{helper}</p>}
        </div>
    );
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
    return (
        <span
            className={clsx(
                'inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                badgeToneClass[tone]
            )}
        >
            <span className="min-w-0 break-words">{children}</span>
        </span>
    );
}

export function Button({
    variant = 'primary',
    className,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof buttonVariantClass;
}) {
    return (
        <button
            {...props}
            className={clsx(
                'inline-flex min-h-10 max-w-full items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100',
                buttonVariantClass[variant],
                className
            )}
        />
    );
}

export function DataTable({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={clsx(
                'min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)]',
                '[&_td]:align-top [&_tbody_tr]:transition [&_tbody_tr:hover]:bg-slate-50/80 [&_th]:border-b [&_th]:border-slate-200',
                className
            )}
        >
            <div className="overflow-x-auto">{children}</div>
        </div>
    );
}

export function ActionItemCard({
    title,
    description,
    badge,
    action,
    className,
}: {
    title: string;
    description: string;
    badge?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx('w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-white', className)}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="min-w-0 break-words text-sm font-semibold text-slate-950">{title}</h3>
                        {badge}
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-600">{description}</p>
                </div>
                {action && <div className="flex flex-none flex-wrap gap-2">{action}</div>}
            </div>
        </div>
    );
}

export function EmptyState({
    title,
    description,
    action,
    className,
}: {
    title: string;
    description: string;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx('flex min-w-0 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center', className)}>
            <h2 className="break-words text-sm font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 max-w-xl break-words text-sm leading-6 text-slate-600">{description}</p>
            {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
        </div>
    );
}

export function FormSection({
    title,
    description,
    children,
    className,
    badge,
}: {
    title: string;
    description?: string;
    children: ReactNode;
    className?: string;
    badge?: ReactNode;
}) {
    return (
        <fieldset className={clsx('min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)]', className)}>
            <legend className="px-1">
                <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                    <span className="break-words text-sm font-semibold text-slate-950">{title}</span>
                    {badge}
                </span>
            </legend>
            {description && <p className="mt-1 break-words text-xs leading-5 text-slate-600">{description}</p>}
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">{children}</div>
        </fieldset>
    );
}
