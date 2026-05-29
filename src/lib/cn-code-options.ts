export interface CnCodeOption {
    code: string;
    goodsCategory: string;
    labelKo: string;
    description: string;
}

export const CN_CODE_OPTIONS: CnCodeOption[] = [
    {
        code: '72011011',
        goodsCategory: 'Pig iron',
        labelKo: '비합금 선철',
        description: 'Non-alloy pig iron, primary forms',
    },
    {
        code: '72071111',
        goodsCategory: 'Crude steel',
        labelKo: '비합금강 반제품',
        description: 'Semi-finished products of iron or non-alloy steel',
    },
    {
        code: '72071919',
        goodsCategory: 'Crude steel',
        labelKo: '철강 반제품',
        description: 'Semi-finished products of iron or non-alloy steel',
    },
    {
        code: '72081000',
        goodsCategory: 'Iron or steel products',
        labelKo: '열연 평판압연제품',
        description: 'Flat-rolled products, hot-rolled, width >= 600 mm',
    },
    {
        code: '72083700',
        goodsCategory: 'Iron or steel products',
        labelKo: '열연 코일',
        description: 'Flat-rolled products in coils, hot-rolled',
    },
    {
        code: '72083900',
        goodsCategory: 'Iron or steel products',
        labelKo: '열연 코일',
        description: 'Flat-rolled products in coils, hot-rolled',
    },
    {
        code: '72085120',
        goodsCategory: 'Iron or steel products',
        labelKo: '열연 후판',
        description: 'Flat-rolled products not in coils, hot-rolled',
    },
    {
        code: '72091610',
        goodsCategory: 'Iron or steel products',
        labelKo: '냉연 코일',
        description: 'Flat-rolled products in coils, cold-rolled',
    },
    {
        code: '72104900',
        goodsCategory: 'Iron or steel products',
        labelKo: '도금 강판',
        description: 'Flat-rolled products, plated or coated',
    },
    {
        code: '73063080',
        goodsCategory: 'Iron or steel products',
        labelKo: '용접 강관',
        description: 'Tubes, pipes and hollow profiles, welded',
    },
    {
        code: '73066192',
        goodsCategory: 'Iron or steel products',
        labelKo: '각형 용접 강관',
        description: 'Welded square or rectangular tubes and hollow profiles',
    },
    {
        code: '73181595',
        goodsCategory: 'Iron or steel products',
        labelKo: '철강제 볼트 및 스크류',
        description: 'Screws and bolts of iron or steel',
    },
    {
        code: '73181699',
        goodsCategory: 'Iron or steel products',
        labelKo: '철강제 너트',
        description: 'Nuts of iron or steel',
    },
];
