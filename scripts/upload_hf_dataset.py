"""Upload a folder built by build_hf_dataset.py. Run `hf auth login` first.

A new repository is created private. Visibility of an existing one is never changed.
"""
import argparse

from huggingface_hub import HfApi

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder")
    parser.add_argument("--repo", default="wenhaoyan77/WorldCast")
    parser.add_argument("--message", default="Update WorldCast dataset")
    args = parser.parse_args()
    api = HfApi()
    api.create_repo(args.repo, repo_type="dataset", private=True, exist_ok=True)
    # delete_patterns keeps the repository in sync when the shard count changes.
    commit = api.upload_folder(repo_id=args.repo, repo_type="dataset", folder_path=args.folder,
                               allow_patterns=["README.md", "data/*.parquet"],
                               delete_patterns=["data/*.parquet"], commit_message=args.message)
    print(commit.commit_url)
