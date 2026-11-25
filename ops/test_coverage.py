"""Which lawebs.co.il pages the two installers leave without a measurement tag."""
import importlib.util
from pathlib import Path
import re
import unittest


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# The same anchors, and for actions the same ignored case, as the Nginx maps they write.
INSTALLERS = [(load('install-visitor-coverage'), 0), (load('install-growth-coverage'), re.IGNORECASE)]


class Untracked(unittest.TestCase):
    def check(self, page, expected):
        for module, flags in INSTALLERS:
            for host in ('lawebs.co.il', 'www.lawebs.co.il'):
                found = re.search(rf'^(www\.)?lawebs\.co\.il:/({module.LAWEBS_UNTRACKED})(/|$)', f'{host}:{page}', flags)
                self.assertEqual(bool(found), expected, (module.__name__, host, page))

    def test_pages_that_promise_no_tracking_get_no_tag(self):
        for page in ('/bestpresent', '/bestpresent/', '/bestpresent/noa', '/bestpresent/g/token', '/bestpresent/create',
                     '/yomuledet/', '/ball-coaster/', '/desk/', '/alenu-crm/login'):
            self.check(page, True)

    def test_la_webs_keeps_its_own_tag(self):
        for page in ('/', '/work/koral/', '/bestpresents', '/best', '/cv/', '/Koralevents'):
            self.check(page, False)


if __name__ == '__main__':
    unittest.main()
