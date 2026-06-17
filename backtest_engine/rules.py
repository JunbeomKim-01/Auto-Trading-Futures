"""조건 평가 엔진. 설계서 6/7장.

전략 조건은 JSON 트리(logic + conditions)로 저장하고 봉 단위로 평가한다.
값 참조는 컬럼명, 숫자, 그리고 제한된 산술식("volume_ma20 * 1.5")을 지원한다.
eval() 대신 ast 화이트리스트로 안전하게 계산한다(설계서 6.1 회피).
"""
from __future__ import annotations

import ast
import math
import operator
from typing import Any

Row = dict[str, Any]

_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def _eval_node(node: ast.AST, ns: Row) -> Any:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body, ns)
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return ns.get(node.id)
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        left = _eval_node(node.left, ns)
        right = _eval_node(node.right, ns)
        if left is None or right is None:
            return None
        return _BIN_OPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        val = _eval_node(node.operand, ns)
        return None if val is None else _UNARY_OPS[type(node.op)](val)
    raise ValueError(f"허용되지 않은 식: {ast.dump(node)}")


def resolve_value(row: Row, ref: Any) -> Any:
    """참조를 실제 값으로. 숫자/컬럼명/산술식 지원. 설계서 7.2."""
    if isinstance(ref, (int, float)):
        return ref
    if not isinstance(ref, str):
        return ref
    # 단순 컬럼명 빠른 경로.
    if ref in row:
        return row[ref]
    tree = ast.parse(ref, mode="eval")
    return _eval_node(tree, row)


def _is_nan(v: Any) -> bool:
    return isinstance(v, float) and math.isnan(v)


def evaluate_condition(row: Row, prev_row: Row | None, condition: dict[str, Any]) -> bool:
    """단일 조건 평가. 설계서 7.2 + 7.4 크로스. 미정의/NaN 은 False."""
    op = condition["operator"]

    if op in ("cross_over", "cross_under"):
        if prev_row is None:
            return False
        cl = resolve_value(row, condition["left"])
        cr = resolve_value(row, condition["right"])
        pl_ = resolve_value(prev_row, condition["left"])
        pr = resolve_value(prev_row, condition["right"])
        if any(v is None or _is_nan(v) for v in (cl, cr, pl_, pr)):
            return False
        if op == "cross_over":
            return pl_ <= pr and cl > cr
        return pl_ >= pr and cl < cr  # cross_under

    left = resolve_value(row, condition["left"])
    right = resolve_value(row, condition["right"])
    if left is None or right is None or _is_nan(left) or _is_nan(right):
        return False

    if op == ">":
        return left > right
    if op == ">=":
        return left >= right
    if op == "<":
        return left < right
    if op == "<=":
        return left <= right
    if op == "==":
        return left == right
    if op == "!=":
        return left != right
    raise ValueError(f"지원하지 않는 연산자: {op}")


def evaluate_rule(row: Row, prev_row: Row | None, rule: dict[str, Any]) -> bool:
    """AND/OR 트리 평가. conditions 안에 leaf 또는 하위 rule 중첩 가능. 설계서 7.3."""
    logic = rule.get("logic", "AND").upper()
    results = []
    for child in rule["conditions"]:
        if "logic" in child:  # 중첩 그룹
            results.append(evaluate_rule(row, prev_row, child))
        else:
            results.append(evaluate_condition(row, prev_row, child))

    if logic == "AND":
        return all(results)
    if logic == "OR":
        return any(results)
    raise ValueError(f"지원하지 않는 logic: {logic}")
