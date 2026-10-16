import { describe, expect, it } from 'vitest'
import { csvCell, csvFileName, reportCsv } from './csv'

describe('report CSV', () => {
  it('lays out details, sections, money columns and a total row the way a spreadsheet expects', () => {
    const csv = reportCsv(
      [['Report', 'Sales report'], ['Branch', 'All Branches']],
      [{ title: 'Sales by branch', headers: ['Branch', 'Revenue', 'Visits'], rows: [['Ibaan', 1000.5, 3], ['San Jose', 250, 2]], money: [1], total: true }]
    )
    expect(csv.startsWith('﻿')).toBe(true) // Excel reads it as UTF-8
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Report,Sales report',
      'Branch,All Branches',
      '',
      'Sales by branch',
      'Branch,Revenue (PHP),Visits',
      'Ibaan,1000.5,3',
      'San Jose,250,2',
      'Total,1250.5,5',
      ''
    ])
  })

  it('quotes commas and quotes, and keeps formula-like text as text', () => {
    expect(csvCell('Oct 16, 2026')).toBe('"Oct 16, 2026"')
    expect(csvCell('5" collar')).toBe('"5"" collar"')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell(-12)).toBe('-12') // real negative numbers stay numbers
  })

  it('names the file after the report, month and branch', () => {
    expect(csvFileName('Sales report', '2026-09', 'All Branches')).toBe('EcoVet_Sales-report_2026-09_All-Branches.csv')
  })
})
