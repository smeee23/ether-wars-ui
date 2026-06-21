#!/usr/bin/env python3
"""Small S3 JSON/text utility for Ether Wars game-state files.

Credentials are loaded from the standard AWS environment/credential chain.
For local development this script also reads a project .env file without
printing or hardcoding secret values.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path
from typing import Any


DEFAULT_BUCKET = 'justcausepools'
DEFAULT_KEY = 'etherwars/mockstats.json'
DEFAULT_REGION = 'us-east-1'

LOGGER = logging.getLogger('etherwars.s3')


class S3UtilityError(RuntimeError):
    """Expected local setup error for this utility."""


def load_dotenv(path: str | Path = '.env') -> None:
    """Load simple KEY=VALUE entries from .env without overriding env vars."""
    env_path = Path(path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue

        name, value = line.split('=', 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name and name not in os.environ:
            os.environ[name] = value


def normalize_aws_env() -> None:
    """Support legacy S3_* names while letting standard AWS_* names win."""
    aliases = {
        'AWS_ACCESS_KEY_ID': 'S3_ACCESS_KEY',
        'AWS_SECRET_ACCESS_KEY': 'S3_SECRET_KEY',
        'AWS_SESSION_TOKEN': 'S3_SESSION_TOKEN',
        'AWS_DEFAULT_REGION': 'S3_REGION',
    }
    for aws_name, legacy_name in aliases.items():
        if aws_name not in os.environ and legacy_name in os.environ:
            os.environ[aws_name] = os.environ[legacy_name]


def get_s3_client(region_name: str | None = None):
    """Create an S3 client using boto3's credential provider chain."""
    try:
        import boto3
    except ImportError as exc:
        raise S3UtilityError(
            'boto3 is required for S3 access. Install it with: python3 -m pip install boto3'
        ) from exc

    session_kwargs = {}
    if region_name:
        session_kwargs['region_name'] = region_name
    session = boto3.session.Session(**session_kwargs)
    return session.client('s3')


def describe_s3_error(exc: Exception, bucket: str, key: str) -> str:
    """Return a concise, non-secret S3 error for CLI output."""
    response = getattr(exc, 'response', None)
    error = response.get('Error', {}) if isinstance(response, dict) else {}
    code = error.get('Code')
    message = error.get('Message')
    target = f's3://{bucket}/{key}'

    if code:
        return f'Failed to access {target}: {code}: {message or "S3 request failed"}'
    return f'Failed to access {target}: {exc}'


def read_text_from_s3(bucket: str, key: str, *, s3_client=None) -> str:
    """Read a UTF-8 text object from S3."""
    client = s3_client or get_s3_client(os.getenv('AWS_DEFAULT_REGION', DEFAULT_REGION))
    response = client.get_object(Bucket=bucket, Key=key)
    return response['Body'].read().decode('utf-8')


def write_text_to_s3(bucket: str, key: str, text: str, *, s3_client=None) -> None:
    """Write a UTF-8 text object to S3."""
    client = s3_client or get_s3_client(os.getenv('AWS_DEFAULT_REGION', DEFAULT_REGION))
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=text.encode('utf-8'),
        ContentType='text/plain; charset=utf-8',
        CacheControl='max-age=60',
    )


def read_json_from_s3(bucket: str, key: str, *, s3_client=None) -> Any:
    """Read and parse a JSON object from S3."""
    return json.loads(read_text_from_s3(bucket, key, s3_client=s3_client))


def write_json_to_s3(bucket: str, key: str, data: Any, *, s3_client=None) -> None:
    """Serialize data as JSON and write it to S3."""
    text = json.dumps(data, indent=2, sort_keys=True) + '\n'
    client = s3_client or get_s3_client(os.getenv('AWS_DEFAULT_REGION', DEFAULT_REGION))
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=text.encode('utf-8'),
        ContentType='application/json; charset=utf-8',
        CacheControl='max-age=60',
    )


class S3ReadWrite:
    """Compatibility wrapper around the Ether Wars S3 helpers."""

    def __init__(
        self,
        aws_secret_access_key: str | None = None,
        aws_access_key_id: str | None = None,
        bucket_name: str = DEFAULT_BUCKET,
        region_name: str | None = None,
    ):
        if aws_access_key_id and 'AWS_ACCESS_KEY_ID' not in os.environ:
            os.environ['AWS_ACCESS_KEY_ID'] = aws_access_key_id
        if aws_secret_access_key and 'AWS_SECRET_ACCESS_KEY' not in os.environ:
            os.environ['AWS_SECRET_ACCESS_KEY'] = aws_secret_access_key

        self.bucket_name = bucket_name
        self.s3 = get_s3_client(region_name or os.getenv('AWS_DEFAULT_REGION', DEFAULT_REGION))

    def get_data(self, file_key: str) -> Any:
        return read_json_from_s3(self.bucket_name, file_key, s3_client=self.s3)

    def write_data(self, file_key: str, data: Any) -> None:
        write_json_to_s3(self.bucket_name, file_key, data, s3_client=self.s3)

    def append_data(self, file_key: str, data: Any) -> None:
        existing_data = self.get_data(file_key)

        if isinstance(existing_data, list):
            next_data = existing_data + [data]
        else:
            next_data = [existing_data, data]
        self.write_data(file_key, next_data)


def summarize_json(data: Any) -> str:
    if isinstance(data, dict):
        keys = ', '.join(list(data.keys())[:12])
        suffix = '...' if len(data) > 12 else ''
        return f'JSON object with {len(data)} keys: {keys}{suffix}'
    if isinstance(data, list):
        return f'JSON array with {len(data)} items'
    return f'JSON {type(data).__name__}: {data!r}'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Read/write Ether Wars S3 game-state files.')
    parser.add_argument('--bucket', default=DEFAULT_BUCKET, help='S3 bucket name')
    parser.add_argument('--key', default=DEFAULT_KEY, help='S3 object key')
    parser.add_argument('--region', default=None, help='AWS region, defaults to env or us-east-1')
    parser.add_argument('--env-file', default='.env', help='dotenv file to load before AWS client setup')
    parser.add_argument('--read-json', action='store_true', help='Read and print parsed JSON')
    parser.add_argument('--read-text', action='store_true', help='Read and print UTF-8 text')
    parser.add_argument('--write-json', help='Write JSON from this local file path')
    parser.add_argument('--write-text', help='Write text from this local file path')
    parser.add_argument('--delete-object', action='store_true', help='Delete the selected S3 object')
    parser.add_argument('--summary', action='store_true', help='Print a concise JSON summary instead')
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    logging.getLogger('botocore.credentials').setLevel(logging.WARNING)
    args = parse_args()

    load_dotenv(args.env_file)
    normalize_aws_env()

    region = args.region or os.getenv('AWS_DEFAULT_REGION', DEFAULT_REGION)
    client = get_s3_client(region)

    write_ops = sum(bool(value) for value in (args.write_json, args.write_text))
    read_ops = sum(bool(value) for value in (args.read_json, args.read_text))
    delete_ops = 1 if args.delete_object else 0
    if write_ops + read_ops + delete_ops != 1:
        raise SystemExit('Choose exactly one operation: --read-json, --read-text, --write-json, --write-text, or --delete-object')

    if args.read_json:
        try:
            data = read_json_from_s3(args.bucket, args.key, s3_client=client)
        except Exception as exc:
            raise S3UtilityError(describe_s3_error(exc, args.bucket, args.key)) from exc
        if args.summary:
            print(summarize_json(data))
        else:
            print(json.dumps(data, indent=2, sort_keys=True))
        return 0

    if args.read_text:
        try:
            print(read_text_from_s3(args.bucket, args.key, s3_client=client))
        except Exception as exc:
            raise S3UtilityError(describe_s3_error(exc, args.bucket, args.key)) from exc
        return 0

    if args.write_json:
        data = json.loads(Path(args.write_json).read_text(encoding='utf-8'))
        try:
            write_json_to_s3(args.bucket, args.key, data, s3_client=client)
        except Exception as exc:
            raise S3UtilityError(describe_s3_error(exc, args.bucket, args.key)) from exc
        LOGGER.info('Wrote JSON to s3://%s/%s', args.bucket, args.key)
        return 0

    if args.delete_object:
        try:
            client.delete_object(Bucket=args.bucket, Key=args.key)
        except Exception as exc:
            raise S3UtilityError(describe_s3_error(exc, args.bucket, args.key)) from exc
        LOGGER.info('Deleted s3://%s/%s', args.bucket, args.key)
        return 0

    text = Path(args.write_text).read_text(encoding='utf-8')
    try:
        write_text_to_s3(args.bucket, args.key, text, s3_client=client)
    except Exception as exc:
        raise S3UtilityError(describe_s3_error(exc, args.bucket, args.key)) from exc
    LOGGER.info('Wrote text to s3://%s/%s', args.bucket, args.key)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except S3UtilityError as exc:
        raise SystemExit(str(exc)) from exc
