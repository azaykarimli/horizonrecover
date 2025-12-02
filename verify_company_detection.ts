import { mapRecordToSddSale, CompanyConfig } from './lib/emp';

const mockRecord = {
    amount: '10,00',
    vzweck1: 'Test Usage',
    customername: 'John Doe',
    iban: 'DE12345678901234567890',
};

const mockConfig: CompanyConfig = {
    name: 'Test Company',
    contactEmail: 'test@example.com',
    returnUrls: {
        baseUrl: 'https://test.com',
        successPath: '/ok',
    },
    dynamicDescriptor: {
        merchantName: 'Test Merchant',
        merchantUrl: 'https://test.com',
    },
    fallbackDescription: 'Fallback Usage',
};

try {
    const customMapping = { usage: ['Usage'] };
    const result = mapRecordToSddSale(mockRecord, 0, customMapping as any, 'test.csv', mockConfig);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.usage === 'Fallback Usage') {
        console.log('SUCCESS: Fallback description used.');
    } else {
        console.error('FAILURE: Fallback description NOT used.');
    }

    if (result.dynamicDescriptorParams?.merchantName === 'Test Merchant') {
        console.log('SUCCESS: Dynamic descriptor used.');
    } else {
        console.error('FAILURE: Dynamic descriptor NOT used.');
    }

} catch (error) {
    console.error('Error:', error);
}
