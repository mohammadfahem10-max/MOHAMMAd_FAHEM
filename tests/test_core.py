import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from parsiscan.numbers import classify_number, find_numbers  # noqa: E402
from parsiscan.pipeline import PawOut, assemble_line  # noqa: E402
from parsiscan.textnorm import normalize, visual_to_logical  # noqa: E402
from parsiscan.fontboot import split_paws  # noqa: E402


def test_normalize_presentation_forms():
    assert normalize("\ufeb7\ufee4\ufe8e\ufead\ufee9") == "شماره"
    assert normalize("كريمي") == "کریمی"
    assert normalize("ﻻ") == "لا"


def test_visual_to_logical_numbers_and_url():
    # visual RTL of "تاریخ 1404/11/01" : letters, space, then digits collected right-to-left
    vis = "تاریخ " + "1404/11/01"[::-1]
    assert visual_to_logical(vis) == "تاریخ 1404/11/01"
    vis = "www.adliran.ir"[::-1] + " سایت"
    assert visual_to_logical(vis) == "www.adliran.ir سایت"


def _paw(label, x0, x1, word, status="ok"):
    return PawOut(box=(x0, 0, x1, 20), label=label, score=1.0, status=status, word_index=word)


def test_assemble_line_orders_digits_left_to_right():
    # PAWs listed right-to-left: 'تاریخ' then digits of 1404/11/01 (rightmost digit first)
    paws = [_paw("تا", 300, 320, 0), _paw("ریخ", 270, 299, 0)]
    digits = list("1404/11/01")
    x = 200
    for ch in digits:               # left to right in the image
        paws.append(_paw(ch, x, x + 8, 1))
        x += 10
    paws[2:] = sorted(paws[2:], key=lambda p: -p.box[0])   # right-to-left order as the segmenter emits
    assert assemble_line(paws) == "تاریخ 1404/11/01"


def test_assemble_line_touching_digit_label_and_unknown():
    paws = [_paw("مبلغ", 300, 340, 0), _paw("0", 118, 126, 1), _paw("00", 100, 116, 1), _paw(",", 96, 99, 1),
            _paw("5", 86, 94, 1), _paw(None, 40, 60, 2, status="unknown")]
    assert assemble_line(paws) == "مبلغ 5,000 ▯"


def test_number_classification():
    assert classify_number("1404/11/01").kind == "date" and classify_number("1404/11/01").valid
    assert not classify_number("1404/13/01").valid
    assert classify_number("38,861,600").kind == "amount"
    assert not classify_number("38,86,600").valid
    assert classify_number("1742853838").kind == "national_id" and classify_number("1742853838").valid
    assert classify_number("09123198925").kind == "phone"
    kinds = {n.kind for n in find_numbers("مبلغ 52.000.000.000 ریال مورخ 1403/11/29 ساعت 08:50")}
    assert {"amount", "date", "time"} <= kinds


def test_split_paws():
    assert split_paws("بازگشت") == ["با", "ز", "گشت"]
    assert split_paws("دادگستری") == ["د", "ا", "د", "گستر", "ی"]
    assert split_paws("نام‌خانوادگی") == ["نا", "م", "خا", "نو", "ا", "د", "گی"]


def test_expected_paws_visual_and_marks():
    from parsiscan.transcript import expected_paws, expected_paws_visual
    from parsiscan.library import mark_masses
    assert expected_paws("شماره") == ["شما", "ر", "ه"]
    assert expected_paws("1403/11/28") == list("1403/11/28")
    # on paper the number reads left-to-right, so right-to-left it is reversed
    assert expected_paws_visual("مورخ1403") == ["مو", "ر", "خ", "3", "0", "4", "1"]
    assert expected_paws("ضمناً")[-1].endswith("ً")
    img = np.zeros((40, 20), np.uint8)
    img[15:35, 5:15] = 255          # body
    img[3:7, 8:12] = 255            # dot above
    above, below = mark_masses(img)
    assert above > 0.05 and below == 0
