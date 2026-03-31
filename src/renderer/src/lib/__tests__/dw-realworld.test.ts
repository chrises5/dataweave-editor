import { describe, it, expect } from 'vitest'
import { formatDataWeave } from '../dataweave-formatter-v2'
import { parse, ParseError } from '../dw-parser'
import { lex, TK } from '../dw-lexer'

const REAL_SCRIPT = `%dw 2.0
output application/json

import * from dw::core::Strings
import * from dw::Runtime
import * from dwl::common

//var NOTES__C_ID = "Z001" SM-1185
var languagePriority = (vars.agLanguages default []) ++ defaultISOLanguagePriority filter $ != null

var nullChar = "\\u{2400}"

fun nullBoolean(b: Boolean | Null) = do {
    if(b != null and b) (
        true
    ) else (
        false
    )
}

fun mapRegion(regionMapping, country, region) = do {
    if(country == null or region == null) (
        null
    ) else if(country == nullChar or region == nullChar) (
        nullChar
    ) else (
        regionMapping[country][region]
    )
}

fun compositeRequestStage(method, sObject, externalId, referenceId, records: Array) = do {
    var r = records filter $ != null
    ---
    if(r != null and !isEmpty(r)) (
        [{
            method: method,
            url: "$(p("sf.apiBasePath"))/composite/sobjects/$(sObject)/$(externalId)",
            referenceId : referenceId,
            body:{
                allOrNone: true,
                records: r
            }
        }]
    ) else (
        []
    )
}

fun compositeRequestStageDelete(referenceId, recordIds: Array<String>) = do {
    if (not isEmpty(recordIds)) (
        [
            {
                method: "DELETE",
                url: "$(p("sf.apiBasePath"))/composite/sobjects?ids=$(recordIds joinBy ",")",
                referenceId: referenceId
            }
        ]
    ) else (
        []
    )
}

fun getAccountBySapId(accs, id, salesOrg, distChan) = (accs filter $.SAP_ID__c == id and $.salesOrg == salesOrg and $.distChan == distChan)[0]

var existingKeys = vars.orderItems map $.Key__c

var deliveryGroup = vars.cdmOrder.deliveryGroups[0]

var odgProxies = vars.cdmOrder.deliveryGroups map {
    attributes: {
        "type": "OrderDeliveryGroupProxy__c"
    },
    Name: "test"
}

var orderRoles =
do
{
    var prefix = "test"
    ---
    deliveryGroup.partners map ((partner) ->
    {
        attributes: {
            "type": "OrderRole__c"
        },
        Key__c: "$(prefix)|$(partner.partnerFunction)"
    })
}

fun accConditions(conditions) =
    conditions reduce (item, acc={absoluteAdjustment: 0}) -> {
            conditionType: item.conditionType,
            absoluteAdjustment: acc.absoluteAdjustment + item.absoluteAdjustment
    }

var conditionGrouping = (flatten(vars.cdmOrder..*conditions) groupBy $.conditionType)
var taxConditions = conditionGrouping."MWST" groupBy $.percentageAdjustment
---
{
    allOrNone : true,
    compositeRequest :
        compositeRequestStage("PATCH", "OrderItem", "Key__c", "orderItems", [])
        ++
        compositeRequestStage("PATCH", "OrderRole__c", "Key__c", "orderRoles", orderRoles)
}`

describe('real-world script', () => {
  it('lexes without error', () => {
    const tokens = lex(REAL_SCRIPT)
    expect(tokens.length).toBeGreaterThan(100)
  })

  it('parses without error', () => {
    let error: string | null = null
    try {
      parse(REAL_SCRIPT)
    } catch (e) {
      if (e instanceof ParseError) {
        error = `ParseError at line ${(e as any).line}, col ${(e as any).col}: ${e.message}`
      } else {
        error = String(e)
      }
    }
    expect(error, `Parse failed: ${error}`).toBeNull()
  })

  it('formats and changes output', () => {
    const result = formatDataWeave(REAL_SCRIPT)
    expect(result).not.toBe(REAL_SCRIPT)
  })

  // Test individual constructs that appear in real script
  it('parses import * from', () => {
    try { parse('%dw 2.0\nimport * from dw::core::Strings\n---\n1') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses fun with type annotation', () => {
    try { parse('%dw 2.0\nfun nullBoolean(b: Boolean | Null) = true\n---\n1') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses do block with bare braces (no keyword before)', () => {
    try { parse('%dw 2.0\n---\ndo\n{\nvar x = 1\n---\nx\n}') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses reduce with default accumulator', () => {
    try { parse('%dw 2.0\n---\n[1,2] reduce (item, acc=0) -> acc + item') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses groupBy', () => {
    try { parse('%dw 2.0\n---\npayload groupBy $.type') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses filterObject', () => {
    try { parse('%dw 2.0\n---\n{a: 1} filterObject (true)') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses descendant selector ..*', () => {
    try { parse('%dw 2.0\n---\npayload..*name') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses joinBy', () => {
    try { parse('%dw 2.0\n---\n[1,2] joinBy ","') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses not operator', () => {
    try { parse('%dw 2.0\n---\nnot true') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses pluck', () => {
    try { parse('%dw 2.0\n---\n{a: 1} pluck $') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses flatten', () => {
    try { parse('%dw 2.0\n---\nflatten([[1],[2]])') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses write function', () => {
    try { parse('%dw 2.0\n---\nwrite([], "application/json", {indent: false})') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses Array<String> type annotation', () => {
    try { parse('%dw 2.0\nfun f(x: Array<String>) = x\n---\n1') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses do block WITHOUT braces on same line as do keyword', () => {
    // This pattern: do\\n{...} where { is on next line
    try { parse('%dw 2.0\n---\ndo\n{\nvar x = 1\n---\nx\n}') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses conditional key-value (key: val) if(cond)', () => {
    try { parse('%dw 2.0\n---\n{(a: 1) if(true)}') }
    catch (e) { expect.fail(`${e}`) }
  })

  it('parses string selector .\"key\"', () => {
    try { parse('%dw 2.0\n---\npayload."MWST"') }
    catch (e) { expect.fail(`${e}`) }
  })
})
