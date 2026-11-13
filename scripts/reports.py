#!/usr/bin/env python3
"""Merge Go + web test results into repo-root junit.xml and coverage.xml (wq-ci contract).

Usage: reports.py <go-test.json> <go-cover.out> <web-junit.xml> <web-cobertura.xml>
Stdlib only. ponytail: line coverage only, no branch data; add a real tool if diff-cover needs more.
"""
import json
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

MODULE = "github.com/JMO-Labs/tdog/"


def go_junit(path):
    suites = defaultdict(list)  # package -> [(test, action, output)]
    out = defaultdict(str)
    for line in open(path):
        ev = json.loads(line)
        test, pkg = ev.get("Test"), ev.get("Package", "")
        if not test:
            continue
        if ev["Action"] == "output":
            out[(pkg, test)] += ev.get("Output", "")
        elif ev["Action"] in ("pass", "fail", "skip"):
            suites[pkg].append((test, ev["Action"], ev.get("Elapsed", 0)))
    for pkg, cases in suites.items():
        s = ET.Element("testsuite", name=pkg, tests=str(len(cases)),
                       failures=str(sum(a == "fail" for _, a, _ in cases)))
        for test, action, elapsed in cases:
            c = ET.SubElement(s, "testcase", classname=pkg, name=test, time=str(elapsed))
            if action == "fail":
                ET.SubElement(c, "failure", message="failed").text = out[(pkg, test)]
            elif action == "skip":
                ET.SubElement(c, "skipped")
        yield s


def go_cobertura(path):
    hits = defaultdict(dict)  # file -> {line: count}
    for line in open(path):
        if line.startswith("mode:") or not line.strip():
            continue
        loc, _, count = line.rsplit(" ", 2)
        f, span = loc.split(":")
        start, end = (int(p.split(".")[0]) for p in span.split(","))
        for n in range(start, end + 1):
            hits[f.removeprefix(MODULE)][n] = max(hits[f.removeprefix(MODULE)].get(n, 0), int(count))
    pkg = ET.Element("package", name="go")
    classes = ET.SubElement(pkg, "classes")
    for f, lines in sorted(hits.items()):
        c = ET.SubElement(classes, "class", name=f, filename=f)
        ls = ET.SubElement(c, "lines")
        for n, h in sorted(lines.items()):
            ET.SubElement(ls, "line", number=str(n), hits=str(h))
    return pkg


def main(go_json, go_cover, web_junit, web_cov):
    suites = ET.Element("testsuites", name="tdog")
    suites.extend(go_junit(go_json))
    suites.extend(ET.parse(web_junit).getroot().iter("testsuite"))
    ET.ElementTree(suites).write("junit.xml", encoding="utf-8", xml_declaration=True)

    cov = ET.Element("coverage", version="tdog")
    ET.SubElement(ET.SubElement(cov, "sources"), "source").text = "."
    pkgs = ET.SubElement(cov, "packages")
    pkgs.append(go_cobertura(go_cover))
    for p in ET.parse(web_cov).getroot().iter("package"):
        for c in p.iter("class"):
            c.set("filename", "web/" + c.get("filename", ""))
        pkgs.append(p)
    ET.ElementTree(cov).write("coverage.xml", encoding="utf-8", xml_declaration=True)

    failed = any(s.get("failures", "0") != "0" for s in suites)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(*sys.argv[1:5])
