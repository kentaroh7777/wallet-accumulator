import { createObjectCsvStringifier } from 'csv-writer';
import { AggregatedBalance } from '../types';
import fs from 'fs';
import iconv from 'iconv-lite';

export class CsvExporter {
  private writeCsvAsSjis(filePath: string, header: { id: string, title: string }[], records: Record<string, unknown>[]) {
    const stringifier = createObjectCsvStringifier({
      header,
      // Excel互換を意識してCRLF
      recordDelimiter: '\r\n',
    });

    const csvText = stringifier.getHeaderString() + stringifier.stringifyRecords(records);
    const encoded = iconv.encode(csvText, 'Shift_JIS');
    fs.writeFileSync(filePath, encoded);
  }

  async exportTotal(data: AggregatedBalance[], filePath: string) {
    const header = [
      { id: 'symbol', title: 'トークン' },
      { id: 'empty1', title: '' },
      { id: 'label', title: '保有量' },
      { id: 'empty2', title: '' },
      { id: 'amount', title: '計測数量' },
      { id: 'empty3', title: '' },
      { id: 'empty4', title: '' },
      { id: 'rate', title: 'JPYへのレート' },
    ];

    const records = data.map(d => ({
      symbol: d.symbol,
      empty1: '',
      label: '保有量',
      empty2: '',
      amount: d.totalAmount,
      empty3: '',
      empty4: '',
      rate: d.priceJpy,
    }));

    this.writeCsvAsSjis(filePath, header, records);
  }

  async exportDetail(data: AggregatedBalance[], filePath: string) {
    const header = [
      { id: 'symbol', title: 'トークン' },
      { id: 'sourceType', title: '保管場所タイプ' },
      { id: 'sourceName', title: '名称/アドレス' },
      { id: 'chain', title: 'ネットワーク' },
      { id: 'amount', title: '保有量' },
      { id: 'price', title: '価格(JPY)' },
      { id: 'value', title: '評価額(JPY)' },
    ];

    const records = data.flatMap(agg => {
      // detailモードでも、残高0のトークンを「0であることを確定」できるように1行出力する。
      // 「保管場所タイプ」には状態（残高0など）ではなく、場所（wallet/cex）を出す。
      // 明細が無い場合は、walletとして空欄（アドレス/ネットワーク不明）で0行を出す。
      if (agg.details.length === 0) {
        return [{
          symbol: agg.symbol,
          sourceType: 'wallet',
          sourceName: '',
          chain: '',
          amount: 0,
          price: agg.priceJpy,
          value: 0,
        }];
      }

      return agg.details.map(det => ({
        symbol: det.symbol,
        sourceType: det.sourceType,
        sourceName: det.sourceName,
        chain: det.chain || '',
        amount: det.amount,
        price: agg.priceJpy,
        value: det.amount * agg.priceJpy,
      }));
    });

    // Sort: Token -> Address -> Network
    records.sort((a, b) => {
      if (a.symbol !== b.symbol) {
        return a.symbol.localeCompare(b.symbol);
      }
      if (a.sourceName !== b.sourceName) {
        return a.sourceName.localeCompare(b.sourceName);
      }
      return a.chain.localeCompare(b.chain);
    });

    this.writeCsvAsSjis(filePath, header, records);
  }
}
